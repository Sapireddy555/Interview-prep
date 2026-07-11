
export type InterviewSettings = {
  role: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topics: string | string[];
  questionBank?: string;
};

export type Message = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createdAt?: string;
  sectionId?: 'communication' | 'technical' | 'resume_projects';
  sectionTitle?: string;
};

export type Feedback = {
  feedback: string;
  suggestions: string;
  score: number;
};

export type SecurityEvent = {
  timestamp: string; // mm:ss relative to interview start
  type:
    | 'visibility_hidden'
    | 'visibility_visible'
    | 'window_blur'
    | 'window_focus'
    | 'copy'
    | 'cut'
    | 'paste'
    | 'context_menu'
    | 'devtools_suspected'
    | 'screen_share_suspected'
    | 'multi_monitor_suspected'
    | 'proctor_looking_away'
    | 'proctor_typing'
    | 'proctor_phone_detected';
  details?: string;
};

export type ReviewerScorecard = {
  competencies: Array<{
    name: string;
    score: number; // 0-100
    notes?: string;
  }>;
  overallNotes?: string;
  recommendation?: 'Strong Hire' | 'Hire' | 'Leaning Hire' | 'No Hire';
};

export type FullInterviewReport = {
  overallScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  htmlReport: string;
  sectionFeedback: Array<{
    sectionId: 'communication' | 'technical' | 'resume_projects';
    sectionTitle: string;
    score: number;
    summary: string;
    strengths: string[];
    improvements: string[];
  }>;
  rubric: {
    competencies: Array<{
      name: string;
      score: number;
      evidence: Array<{
        quote: string;
        speaker: 'user' | 'ai';
        whyItMatters: string;
      }>;
    }>;
    overallNotes: string;
  };
  technicalFeedback: string;
  behavioralFeedback: string;
  questionFeedback: Array<{
    question: string;
    sectionTitle: string;
    feedback: string;
    score: number;
    evidence: Array<{ quote: string; speaker: 'user' | 'ai' }>;
  }>;
  hiringRecommendation: 'Strong Hire' | 'Hire' | 'Leaning Hire' | 'No Hire';
};

export type InterviewSession = {
  id: string;
  date: string;
  role: string;
  score: number;
  duration: string;
  feedback: Feedback[];
  transcript: Message[];
  summaryReport?: FullInterviewReport | null;
  violations?: { timestamp: string; message: string }[];
  securityEvents?: SecurityEvent[];
  suspicionScore?: number;
  reviewerScorecard?: ReviewerScorecard | null;
  identityStatus?: string | null;
  identityScore?: number | null;
  identityVerifiedAt?: string | null;
  identityError?: string | null;
  reportStatus?: "pending" | "generating" | "complete" | "failed" | null;
  reportError?: string | null;
  l2Scorecard?: any | null;
  l2ScheduledTime?: string | null;
  l2PanelName?: string | null;
  l2PanelEmail?: string | null;
  candidateName?: string | null;
  candidateId?: string | null;
};
