import { pgTable, text, timestamp, jsonb, integer, uuid } from "drizzle-orm/pg-core";

export const scans = pgTable("scans", {
  jobId: text("job_id").primaryKey(),
  targetUrl: text("target_url").notNull(),
  scannedAt: timestamp("scanned_at").notNull(),
  totalPages: integer("total_pages").notNull(),
  scanDurationMs: integer("scan_duration_ms").notNull(),
  summary: jsonb("summary").notNull(), // Store counts, score, etc.
  browsers: jsonb("browsers").notNull(),
  previousJobId: text("previous_job_id"),
  status: text("status").notNull(),
  fullReport: jsonb("full_report"), // Complete report dump for easy API return
});

export const scanIssues = pgTable("scan_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: text("job_id").notNull().references(() => scans.jobId, { onDelete: "cascade" }),
  issueCategory: text("issue_category").notNull(), // 'broken_link', 'ui_issue', 'form_issue', 'journey_issue'
  pageUrl: text("page_url").notNull(),
  severity: text("severity").notNull(),
  issueType: text("issue_type").notNull(),
  description: text("description").notNull(),
  aiCategory: text("ai_category"),
  aiConfidence: integer("ai_confidence"),
  issueStatus: text("issue_status"),
  occurrences: integer("occurrences"),
  details: jsonb("details"), // Bounding box, locators, context JSON
});