CREATE TABLE "scan_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"issue_category" text NOT NULL,
	"page_url" text NOT NULL,
	"severity" text NOT NULL,
	"issue_type" text NOT NULL,
	"description" text NOT NULL,
	"ai_category" text,
	"ai_confidence" integer,
	"issue_status" text,
	"occurrences" integer,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"job_id" text PRIMARY KEY NOT NULL,
	"target_url" text NOT NULL,
	"scanned_at" timestamp NOT NULL,
	"total_pages" integer NOT NULL,
	"scan_duration_ms" integer NOT NULL,
	"summary" jsonb NOT NULL,
	"browsers" jsonb NOT NULL,
	"previous_job_id" text,
	"status" text NOT NULL,
	"full_report" jsonb
);
--> statement-breakpoint
ALTER TABLE "scan_issues" ADD CONSTRAINT "scan_issues_job_id_scans_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scans"("job_id") ON DELETE cascade ON UPDATE no action;