export type InterviewSectionId = "communication" | "technical" | "resume_projects";

export type InterviewQuestion = {
  id: string;
  sectionId: InterviewSectionId;
  sectionTitle: string;
  prompt: string;
};

type ResumeProject = {
  name: string;
  company: string;
  period?: string;
  summary: string;
};

export const INTERVIEW_SECTION_TITLES: Record<InterviewSectionId, string> = {
  communication: "Communication and Aptitude",
  technical: "Technical Questions",
  resume_projects: "Resume Projects",
};

export const COMMUNICATION_AND_ATTITUDE_QUESTIONS = [
  "Tell me about yourself and walk me through the experience that has prepared you for this role.",
  "Why are you interested in this role, and what kind of impact are you hoping to make in your next position?",
  "Describe a situation where you received difficult feedback. How did you respond, and what changed afterward?",
  "When a project gets stressful or ambiguous, how do you keep your attitude constructive and your communication clear with the team?",
];

const TECHNICAL_QUESTION_COUNT = 5;
const RESUME_PROJECT_QUESTION_COUNT = 3;

const DEMO_RESUME_PROJECTS: ResumeProject[] = [
  {
    name: "Assessment and Interview Enablement Platform",
    company: "ValueMomentum",
    period: "2020 to present",
    summary:
      "A recruiter and candidate workflow platform involving interview orchestration, reviewer collaboration, and cloud-hosted supporting services.",
  },
];

const GEN_AI_TECHNICAL_QUESTIONS = [
  "Can you explain the fundamental difference between encoder-only, decoder-only, and encoder-decoder architectures such as BERT, GPT, and T5?",
  "How does multi-head attention work inside a transformer-based model?",
  "What are the common strategies for fine-tuning large language models, and when would you choose PEFT methods such as LoRA?",
  "Can you describe the end-to-end architecture and workflow of a retrieval-augmented generation system?",
  "How do you reduce hallucinations in LLM outputs, and what evaluation techniques do you use to measure factual accuracy?",
  "What are vector databases, and how do they support high-dimensional similarity search in GenAI systems?",
  "Explain embeddings and how the choice of embedding model affects retrieval quality.",
  "What advanced prompt-engineering techniques have you used, such as few-shot prompting or chain-of-thought prompting?",
  "How do you optimize LLM inference for production using techniques such as quantization or KV caching?",
  "What ethical and safety guardrails do you implement before deploying a GenAI system to production?",
  "How do you handle context-window limitations when processing long documents or extended conversations?",
  "What is the difference between a base model and an instruction-tuned model?",
  "How would you explain RLHF, and why is it important for aligning model behavior with user intent?",
  "How would you approach building a multimodal application that combines text and image generation?",
  "What are the biggest challenges of scaling GenAI systems in production under high concurrency?",
  "How do you evaluate the quality of a GenAI system, and which metrics or frameworks do you trust most?",
  "How would you design a caching strategy for LLM responses to reduce latency and cost?",
  "If you were building an autonomous agent, what architectural patterns and frameworks would you choose?",
  "How do you secure prompt inputs, tool calls, and output handling in a production LLM application?",
  "Describe a GenAI project where you had to balance quality, latency, and cost. What trade-offs did you make?",
];

const REACT_TECHNICAL_QUESTIONS = [
  "What are the most significant features introduced in React 18, and how do they improve application performance?",
  "Can you explain how reconciliation and the virtual DOM work in React?",
  "What are the best practices for managing complex state in large React applications, and when would you choose Context API over Redux or Zustand?",
  "How do you optimize React component rendering, and when do tools like React.memo, useMemo, and useCallback actually help?",
  "What is your strategy for handling side effects in React, and how do you ensure useEffect cleanup is done correctly?",
  "Can you explain concurrent rendering and how transitions improve UX?",
  "How do you decide between SSR, SSG, ISR, and client-side rendering in a Next.js application?",
  "What is hydration in React, and how have you debugged hydration mismatches?",
  "How do you ensure React applications are accessible, and what tools or checks do you use?",
  "What is your preferred approach to styling React components and why?",
  "How do you handle form validation and submission in React, and what has been your experience with libraries like React Hook Form?",
  "How do you test React applications, and what do you consider the right balance between unit, integration, and end-to-end tests?",
  "How do you use error boundaries and route-level fallbacks to prevent the entire app from crashing?",
  "What are higher-order components and render props, and how do they compare with custom hooks?",
  "How do you approach API integration and server-state management with tools like React Query or SWR?",
  "What frontend security practices do you follow to reduce risks such as XSS, CSRF, and insecure token handling?",
  "How do you optimize the bundle size of a React application using code splitting and lazy loading?",
  "Describe a time you debugged a memory leak or major performance bottleneck in a React app.",
  "How do you structure reusable component libraries and enforce consistency across teams?",
  "What would you look for when reviewing a pull request for a large React feature?",
];

const JAVA_TECHNICAL_QUESTIONS = [
  "What are the most important features introduced in modern Java versions such as Java 17 or 21?",
  "Can you explain JVM architecture, including heap, stack, and garbage collection?",
  "What are virtual threads, and how do they change concurrency handling in Java applications?",
  "How does Spring Boot auto-configuration work under the hood?",
  "Can you describe the bean lifecycle in a Spring application?",
  "What are the best practices for building scalable microservices using Spring Boot and Spring Cloud?",
  "How do you handle persistence with Hibernate or JPA, and how do you solve the N+1 query problem?",
  "What is your approach to thread safety in Java, and when do you rely on java.util.concurrent utilities?",
  "Which design patterns do you use most often in Java systems, and where have they been useful?",
  "How do you implement authentication and authorization in Java applications with Spring Security and JWT or OAuth2?",
  "What is your strategy for unit, integration, and contract testing in Java services?",
  "How do you design and document REST APIs, and how have you used OpenAPI or Swagger?",
  "How do you optimize SQL queries and database performance in Java-based backends?",
  "What is your experience with Kafka or RabbitMQ, and how do you design reliable asynchronous workflows?",
  "How do you build CI/CD pipelines and containerized deployments for Java services?",
  "What is the difference between checked and unchecked exceptions, and how do you decide which to use?",
  "How do you monitor and profile Java applications in production using tools such as Prometheus, Grafana, or APM products?",
  "Can you explain how HashMap handles collisions and why that matters in practice?",
  "How do you manage distributed transactions or eventual consistency across services?",
  "Describe a backend incident you handled in production and how you diagnosed the root cause.",
];

const DOTNET_TECHNICAL_QUESTIONS = [
  "What are the key differences between .NET Framework and modern .NET, and how has that affected the way you build applications?",
  "How do you structure an ASP.NET Core application for maintainability and testability?",
  "Can you explain the middleware pipeline in ASP.NET Core and how request handling flows through it?",
  "How do dependency injection and service lifetimes work in ASP.NET Core?",
  "What is your approach to building and versioning REST APIs in .NET?",
  "How do you use Entity Framework Core effectively, and how do you avoid issues such as N+1 queries or poor tracking performance?",
  "When would you choose Dapper over Entity Framework, and why?",
  "How do async and await work in C#, and what common mistakes do teams make with asynchronous code?",
  "How do you design background processing in .NET using hosted services, queues, or workers?",
  "What practices do you use to secure .NET applications, including authentication, authorization, and secret management?",
  "How do you write unit and integration tests for .NET services, and what role do tools like xUnit, NUnit, or Moq play?",
  "How do you approach logging, observability, and distributed tracing in a .NET system?",
  "What strategies do you use for configuration management across local, staging, and production environments?",
  "How do you containerize and deploy .NET applications using Docker and Kubernetes?",
  "How do you optimize performance in ASP.NET Core applications under high load?",
  "What is your experience with Azure services such as App Service, Functions, Service Bus, or Azure SQL in a .NET solution?",
  "How do you manage database migrations and schema evolution in Entity Framework Core?",
  "How do you handle exception management and global error handling in ASP.NET Core?",
  "What patterns do you prefer for clean architecture or domain-driven design in .NET systems?",
  "Describe a production issue in a .NET application that you investigated and resolved.",
];

const DEVOPS_TECHNICAL_QUESTIONS = [
  "How do you design a CI/CD pipeline that is fast, reliable, and safe for production deployments?",
  "What branching and release strategies have you used, and how did they affect deployment frequency and stability?",
  "How do you containerize applications with Docker, and what common mistakes do you watch for in Dockerfiles?",
  "How do you manage Kubernetes workloads, configuration, and secrets across environments?",
  "What is your approach to infrastructure as code, and how have you used tools like Terraform, Bicep, or CloudFormation?",
  "How do you implement observability across logs, metrics, traces, and alerting?",
  "What SRE-style reliability practices do you use, such as SLIs, SLOs, and error budgets?",
  "How do you secure a delivery pipeline, including artifact integrity, secrets management, and least-privilege access?",
  "How do you design rollback and disaster-recovery strategies for critical systems?",
  "What is your experience with blue-green, canary, or rolling deployment strategies?",
  "How do you automate environment provisioning for development, staging, and production?",
  "How do you monitor cost and resource utilization in cloud-native environments?",
  "How do you troubleshoot a failing deployment where the application works locally but not in the target environment?",
  "What is your experience with Jenkins, GitHub Actions, Azure DevOps, or GitLab CI, and how do you choose between them?",
  "How do you manage artifact repositories, build caching, and dependency security scanning?",
  "How do you implement policy enforcement and compliance checks in a DevOps workflow?",
  "How do you handle database changes safely as part of CI/CD?",
  "What is your approach to incident response and postmortems after production outages?",
  "How do you tune Kubernetes autoscaling, health probes, and resource requests for stable workloads?",
  "Describe a DevOps improvement you introduced that significantly reduced lead time or production risk.",
];

const SOFTWARE_ENGINEER_TECHNICAL_QUESTIONS = [
  "How do you approach designing a scalable backend or full-stack system for growth in both traffic and features?",
  "What is your strategy for writing clean, maintainable code in a fast-moving team?",
  "How do you choose the right data structure or algorithm for a production problem rather than a textbook exercise?",
  "How do you design APIs that are easy to evolve without breaking consumers?",
  "How do you approach database schema design, indexing, and query optimization?",
  "What is your process for debugging a difficult production issue across multiple services?",
  "How do you balance delivery speed with code quality, testing, and long-term maintainability?",
  "What role should automated testing play across unit, integration, and end-to-end levels?",
  "How do you think about observability, logging, and alerting when building a new service?",
  "What are the most important considerations when securing a modern web application?",
  "How do you review technical trade-offs when choosing between monolith and microservice architectures?",
  "How do you keep systems resilient when downstream services fail or slow down?",
  "What is your experience with asynchronous processing using queues, workers, or event-driven architecture?",
  "How do you optimize application performance at the code, database, and infrastructure levels?",
  "How do CI/CD and release automation influence software quality and team velocity?",
  "How would you evaluate a candidate architecture for a new feature that includes frontend, backend, database, and deployment concerns?",
  "Describe a time you improved developer experience or engineering productivity on a team.",
  "How do you mentor junior engineers while still maintaining delivery momentum?",
  "What does good ownership look like when a feature spans application code, cloud infrastructure, and operations?",
  "Tell me about a complex technical decision you made and how you justified it to the team.",
];

function createSectionQuestions(sectionId: InterviewSectionId, prompts: string[]): InterviewQuestion[] {
  const sectionTitle = INTERVIEW_SECTION_TITLES[sectionId];
  return prompts.map((prompt, index) => ({
    id: `${sectionId}-${index + 1}`,
    sectionId,
    sectionTitle,
    prompt,
  }));
}

function buildResumeProjectQuestions(projects: ResumeProject[]): string[] {
  const resumeQuestions = projects.flatMap((project) => {
    const periodText = project.period ? ` during ${project.period}` : "";
    return [
      `Your resume shows work on ${project.name} at ${project.company}${periodText}. Walk me through the business problem, your responsibilities, and the outcome.`,
      `In ${project.name}, what was the toughest technical or delivery challenge you personally handled, and how did you resolve it?`,
      `Looking back at ${project.name}, what trade-offs did you make, what would you improve now, and why?`,
    ];
  });

  return resumeQuestions.slice(0, RESUME_PROJECT_QUESTION_COUNT);
}

export function getTechnicalQuestionPool(role: string): string[] {
  const technicalQuestionsByRole: Record<string, string[]> = {
    "Generative AI Engineer": GEN_AI_TECHNICAL_QUESTIONS,
    "Gen AI Engineer": GEN_AI_TECHNICAL_QUESTIONS,
    "React Engineer": REACT_TECHNICAL_QUESTIONS,
    "Java Engineer": JAVA_TECHNICAL_QUESTIONS,
    "Java Developer": JAVA_TECHNICAL_QUESTIONS,
    ".NET Developer": DOTNET_TECHNICAL_QUESTIONS,
    "DevOps Engineer": DEVOPS_TECHNICAL_QUESTIONS,
    "Software Engineer": SOFTWARE_ENGINEER_TECHNICAL_QUESTIONS,
  };

  if (technicalQuestionsByRole[role]) return technicalQuestionsByRole[role];

  const normalizedRole = role.toLowerCase();
  if (normalizedRole.includes("react")) return REACT_TECHNICAL_QUESTIONS;
  if (normalizedRole.includes("java")) return JAVA_TECHNICAL_QUESTIONS;
  if (normalizedRole.includes(".net") || normalizedRole.includes("dotnet")) return DOTNET_TECHNICAL_QUESTIONS;
  if (normalizedRole.includes("devops") || normalizedRole.includes("dev ops")) return DEVOPS_TECHNICAL_QUESTIONS;
  if (normalizedRole.includes("gen ai") || normalizedRole.includes("generative ai") || normalizedRole.includes("llm")) {
    return GEN_AI_TECHNICAL_QUESTIONS;
  }

  return technicalQuestionsByRole["Software Engineer"];
}

function normalizeQuestionBank(questionBank?: string | string[]): string[] {
  const questionBankText =
    typeof questionBank === "string"
      ? questionBank
      : Array.isArray(questionBank)
        ? questionBank.join("\n")
        : "";

  return questionBankText
    .split(/\r?\n/)
    .map((question: string) => question.trim())
    .filter(Boolean);
}

function splitQuestionBankBySection(questionBank?: string | string[]) {
  const questions = normalizeQuestionBank(questionBank);
  const sections: Record<"technical" | "resume_projects", string[]> = {
    technical: [],
    resume_projects: [],
  };
  let skipResumeProjects = false;

  for (const question of questions) {
    if (/^\[(no_resume_projects|jd_only)\]/i.test(question)) {
      skipResumeProjects = true;
      continue;
    }

    const sectionMatch = question.match(/^\[(technical|resume_projects)\]\s*(.+)$/i);
    if (sectionMatch) {
      const sectionId = sectionMatch[1].toLowerCase() as "technical" | "resume_projects";
      sections[sectionId].push(sectionMatch[2].trim());
    } else {
      sections.technical.push(question);
    }
  }

  return { ...sections, hasCustomQuestionBank: questions.length > 0, skipResumeProjects };
}

export function getInterviewQuestionSetForRole(role: string, questionBank?: string | string[]): InterviewQuestion[] {
  const customQuestions = splitQuestionBankBySection(questionBank);
  const technicalQuestions =
    customQuestions.technical.length > 0
      ? customQuestions.technical.slice(0, TECHNICAL_QUESTION_COUNT)
      : getTechnicalQuestionPool(role).slice(0, TECHNICAL_QUESTION_COUNT);
  const resumeProjectQuestions =
    customQuestions.resume_projects.length > 0
      ? customQuestions.resume_projects.slice(0, RESUME_PROJECT_QUESTION_COUNT)
      : customQuestions.skipResumeProjects
        ? []
        : buildResumeProjectQuestions(DEMO_RESUME_PROJECTS);

  return [
    ...createSectionQuestions("communication", COMMUNICATION_AND_ATTITUDE_QUESTIONS),
    ...createSectionQuestions("technical", technicalQuestions),
    ...createSectionQuestions("resume_projects", resumeProjectQuestions),
  ];
}

export function getQuestionListForRole(role: string, questionBank?: string | string[]): string[] {
  return getInterviewQuestionSetForRole(role, questionBank).map((question) => question.prompt);
}

export const PREDEFINED_QUESTIONS = getQuestionListForRole("Software Engineer");
export const FALLBACK_QUESTIONS = PREDEFINED_QUESTIONS;
