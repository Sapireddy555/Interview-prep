import createClient from "@azure-rest/ai-vision-image-analysis";
import { AzureKeyCredential } from "@azure/core-auth";

const endpoint = process.env.AZURE_VISION_ENDPOINT || "";
const key = process.env.AZURE_VISION_KEY || "";

const MIN_PERSON_CONFIDENCE = Number(process.env.PROCTOR_MIN_PERSON_CONFIDENCE || "0.55");
const SECOND_PERSON_MIN_CONFIDENCE = Number(process.env.PROCTOR_SECOND_PERSON_CONFIDENCE || "0.72");
const MIN_PERSON_AREA_RATIO = Number(process.env.PROCTOR_MIN_PERSON_AREA_RATIO || "0.04");
const SECOND_PERSON_MIN_AREA_RATIO = Number(process.env.PROCTOR_SECOND_PERSON_AREA_RATIO || "0.08");
const OVERLAP_IOU_THRESHOLD = 0.35;

type PersonDetection = {
  boundingBox: { x: number; y: number; w: number; h: number };
  confidence: number;
  areaRatio: number;
};

function getImageDimensions(result: any) {
  const width = result?.metadata?.width ?? result?.imageMetadata?.width ?? result?.width ?? 0;
  const height = result?.metadata?.height ?? result?.imageMetadata?.height ?? result?.height ?? 0;
  return { width, height };
}

function normalizeBoundingBox(person: any) {
  const bbox = person?.boundingBox;
  if (!bbox) return null;

  const x = bbox.x ?? bbox.left ?? 0;
  const y = bbox.y ?? bbox.top ?? 0;
  const w = bbox.w ?? bbox.width ?? 0;
  const h = bbox.h ?? bbox.height ?? 0;

  if (!w || !h) return null;
  return { x, y, w, h };
}

function bboxArea(bbox: { w: number; h: number }) {
  return bbox.w * bbox.h;
}

function bboxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = bboxArea(a) + bboxArea(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

function toPersonDetections(people: any[], result: any): PersonDetection[] {
  const { width, height } = getImageDimensions(result);
  const frameArea = width && height ? width * height : 0;

  const parsed = people
    .map((person) => {
      const boundingBox = normalizeBoundingBox(person);
      if (!boundingBox) return null;

      const confidence =
        person?.confidence ??
        person?.confidenceScore ??
        person?.score ??
        1;

      const areaRatio = frameArea ? bboxArea(boundingBox) / frameArea : 0;
      return { boundingBox, confidence, areaRatio };
    })
    .filter((person): person is PersonDetection => !!person)
    .filter((person) => person.confidence >= MIN_PERSON_CONFIDENCE)
    .filter((person) => person.areaRatio >= MIN_PERSON_AREA_RATIO)
    .sort((a, b) => b.areaRatio - a.areaRatio);

  const merged: PersonDetection[] = [];
  for (const person of parsed) {
    const overlapsExisting = merged.some(
      (existing) => bboxIoU(existing.boundingBox, person.boundingBox) >= OVERLAP_IOU_THRESHOLD
    );
    if (!overlapsExisting) merged.push(person);
  }

  return merged;
}

function hasCredibleSecondPerson(people: PersonDetection[]) {
  if (people.length <= 1) return false;

  const primary = people[0];
  const secondaryCandidates = people.slice(1).filter((person) => {
    const meetsConfidence = person.confidence >= SECOND_PERSON_MIN_CONFIDENCE;
    const meetsAbsoluteArea = person.areaRatio >= SECOND_PERSON_MIN_AREA_RATIO;
    const meetsRelativeArea = person.areaRatio >= primary.areaRatio * 0.25;
    return meetsConfidence && (meetsAbsoluteArea || meetsRelativeArea);
  });

  return secondaryCandidates.length > 0;
}

function isPersonOffCenter(person: PersonDetection, result: any) {
  const { width } = getImageDimensions(result);
  const bbox = person.boundingBox;
  if (!width || !bbox.w) return false;

  const centerX = (bbox.x + bbox.w / 2) / width;
  const relativeWidth = bbox.w / width;

  return centerX < 0.2 || centerX > 0.8 || relativeWidth < 0.12;
}

export async function analyzeFrameWithAzure(imageDataUri: string) {
  if (!endpoint || !key) {
    console.warn("Azure Vision credentials missing. Returning default no-violation.");
    return { hasViolation: false, violationType: 'none' as const, warningMessage: "" };
  }

  try {
    const base64Data = imageDataUri.split(",")[1];
    const imageBuffer = Buffer.from(base64Data, "base64");

    const client = createClient(endpoint, new AzureKeyCredential(key));

    const response = await client.path("/imageanalysis:analyze").post({
      body: imageBuffer,
      queryParameters: {
        features: ["Objects", "People"],
        "api-version": "2024-02-01",
      },
      contentType: "application/octet-stream",
    });

    if (response.status !== "200") {
      throw new Error(`Analysis failed with status ${response.status}`);
    }

    const result = response.body as any;

    let hasViolation = false;
    let violationType: 'none' | 'looking_away' | 'phone_detected' = 'none';
    let warningMessage = "";

    const rawPeople = result.peopleResult?.values || [];
    const people = toPersonDetections(rawPeople, result);

    if (people.length === 0) {
      hasViolation = true;
      violationType = 'looking_away';
      warningMessage = "Please keep your face visible to the camera.";
    } else if (hasCredibleSecondPerson(people)) {
      hasViolation = true;
      violationType = 'looking_away';
      warningMessage = "Multiple people detected. Please ensure you are alone in the frame.";
    } else if (isPersonOffCenter(people[0], result)) {
      hasViolation = true;
      violationType = 'looking_away';
      warningMessage = "Please face the camera and remain centered during the interview.";
    }

    if (!hasViolation) {
      const objects = result.objectsResult?.values || [];
      const hasPhone = objects.some((obj: any) =>
        (obj.tags || []).some((tag: any) => {
          const name = String(tag.name || "").toLowerCase();
          const confidence = tag.confidence ?? 1;
          return confidence >= 0.5 && (name.includes("cell phone") || name.includes("telephone") || name.includes("mobile phone"));
        })
      );

      if (hasPhone) {
        hasViolation = true;
        violationType = 'phone_detected';
        warningMessage = "Mobile phone usage detected. This is a violation of interview rules.";
      }
    }

    return { hasViolation, violationType, warningMessage };

  } catch (error) {
    console.error("Azure Vision Error:", error);
    return { hasViolation: false, violationType: 'none' as const, warningMessage: "" };
  }
}
