import createClient from "@azure-rest/ai-vision-image-analysis";
import { AzureKeyCredential } from "@azure/core-auth";

const endpoint = process.env.AZURE_VISION_ENDPOINT || "";
const key = process.env.AZURE_VISION_KEY || "";

function getImageDimensions(result: any) {
  const width = result?.metadata?.width ?? result?.imageMetadata?.width ?? result?.width ?? 0;
  const height = result?.metadata?.height ?? result?.imageMetadata?.height ?? result?.height ?? 0;
  return { width, height };
}

function isPersonOffCenter(person: any, result: any) {
  const bbox = person?.boundingBox;
  if (!bbox) return false;

  const { width } = getImageDimensions(result);
  const x = bbox.x ?? bbox.left ?? 0;
  const w = bbox.w ?? bbox.width ?? 0;

  if (!width || !w) return false;

  const centerX = (x + w / 2) / width;
  const relativeWidth = w / width;

  return centerX < 0.2 || centerX > 0.8 || relativeWidth < 0.12;
}

export async function analyzeFrameWithAzure(imageDataUri: string) {
  if (!endpoint || !key) {
    console.warn("Azure Vision credentials missing. Returning default no-violation.");
    return { hasViolation: false, violationType: 'none', warningMessage: "" };
  }

  try {
    const base64Data = imageDataUri.split(",")[1];
    const imageBuffer = Buffer.from(base64Data, "base64");

    const client = createClient(endpoint, new AzureKeyCredential(key));

    // Analyze for People (Face presence) and Objects (Phone detection)
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

    // 1. Face / People Detection (Looking Away check)
    const people = result.peopleResult?.values || [];
    if (people.length === 0) {
      hasViolation = true;
      violationType = 'looking_away';
      warningMessage = "Please keep your face visible to the camera.";
    } else if (people.length > 1) {
      hasViolation = true;
      violationType = 'looking_away';
      warningMessage = "Multiple individuals detected in frame. Please ensure zero interference.";
    } else if (isPersonOffCenter(people[0], result)) {
      hasViolation = true;
      violationType = 'looking_away';
      warningMessage = "Please face the camera and remain centered during the interview.";
    }

    // 2. Object Detection (Phone check)
    if (!hasViolation) {
      const objects = result.objectsResult?.values || [];
      const hasPhone = objects.some((obj: any) => 
        obj.tags.some((tag: any) => tag.name.toLowerCase().includes("cell phone") || tag.name.toLowerCase().includes("telephone"))
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
    return { hasViolation: false, violationType: 'none', warningMessage: "" };
  }
}
