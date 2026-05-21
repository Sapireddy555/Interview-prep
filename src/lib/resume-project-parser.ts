export type ParsedResumeProject = {
  name: string;
  company: string;
  period?: string;
  summary: string;
};

const DATE_RANGE_REGEX =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s*)?(19|20)\d{2}\s*(?:[-–—to]{1,3}|through)\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s*)?((?:19|20)\d{2}|present|current)/i;

const SECTION_HEADER_REGEX =
  /^(experience|work experience|professional experience|projects|project experience|employment|career history)\b/i;

function cleanLine(line: string) {
  return line.replace(/^[\s•●▪\-–—*]+/, "").replace(/\s+/g, " ").trim();
}

function splitCompanyAndTitle(line: string) {
  const atMatch = line.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    return { title: atMatch[1].trim(), company: atMatch[2].trim() };
  }

  const pipeParts = line.split("|").map((part) => part.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    return { title: pipeParts[0], company: pipeParts[1] };
  }

  const dashParts = line.split(/\s[-–—]\s/).map((part) => part.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    return { title: dashParts[0], company: dashParts[1] };
  }

  return { title: line.trim(), company: "Previous employer" };
}

function buildSummary(lines: string[]) {
  return lines.slice(0, 4).join(" ").slice(0, 280);
}

export function extractResumeProjectsFromText(resumeText: string, maxProjects = 3): ParsedResumeProject[] {
  const normalized = resumeText.replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map(cleanLine)
    .filter((line) => line.length > 2);

  const projects: ParsedResumeProject[] = [];
  let currentSection = "experience";
  let blockLines: string[] = [];
  let blockPeriod = "";

  const flushBlock = () => {
    if (!blockLines.length) return;

    const headerLine = blockLines.find((line) => !DATE_RANGE_REGEX.test(line)) || blockLines[0];
    const summaryLines = blockLines.filter((line) => line !== headerLine && !DATE_RANGE_REGEX.test(line));
    const { title, company } = splitCompanyAndTitle(headerLine);

    if (title.length < 3) {
      blockLines = [];
      blockPeriod = "";
      return;
    }

    projects.push({
      name: title,
      company,
      period: blockPeriod || undefined,
      summary: buildSummary(summaryLines),
    });

    blockLines = [];
    blockPeriod = "";
  };

  for (const line of lines) {
    if (SECTION_HEADER_REGEX.test(line)) {
      flushBlock();
      currentSection = /project/i.test(line) ? "projects" : "experience";
      continue;
    }

    const dateMatch = line.match(DATE_RANGE_REGEX);
    if (dateMatch) {
      flushBlock();
      blockPeriod = dateMatch[0];
      const withoutDate = cleanLine(line.replace(DATE_RANGE_REGEX, ""));
      if (withoutDate.length > 3) {
        blockLines.push(withoutDate);
      }
      continue;
    }

    if (currentSection === "projects" || currentSection === "experience") {
      if (!blockLines.length && line.length > 3) {
        blockLines.push(line);
      } else if (blockLines.length) {
        blockLines.push(line);
      }
    }
  }

  flushBlock();

  const deduped = projects.filter((project, index, list) => {
    const key = `${project.name.toLowerCase()}|${project.company.toLowerCase()}`;
    return list.findIndex((entry) => `${entry.name.toLowerCase()}|${entry.company.toLowerCase()}` === key) === index;
  });

  return deduped.slice(0, maxProjects);
}

export function buildResumeProjectQuestionPrompts(
  projects: ParsedResumeProject[],
  role: string,
  maxQuestions = 3
): string[] {
  if (!projects.length) return [];

  const prompts: string[] = [];

  for (const project of projects) {
    const periodText = project.period ? ` (${project.period})` : "";
    prompts.push(
      `[resume_projects] In your ${project.name} project at ${project.company}${periodText}, describe the end-to-end architecture. What services, databases, APIs, and deployment model did you use for this ${role} work?`,
      `[resume_projects] For ${project.name} at ${project.company}, what was the hardest technical problem you personally solved? Explain root cause, options considered, and the final implementation.`,
      `[resume_projects] On ${project.name}, which engineering trade-offs did you make around performance, reliability, security, or delivery speed—and what would you change now?`
    );

    if (prompts.length >= maxQuestions) break;
  }

  return prompts.slice(0, maxQuestions);
}
