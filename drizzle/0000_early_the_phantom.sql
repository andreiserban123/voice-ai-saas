CREATE TYPE "public"."appointment_outcome" AS ENUM('not_requested', 'pending', 'booked', 'unavailable', 'failed');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('pending', 'confirmed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('ringing', 'active', 'completed', 'transferred', 'failed', 'missed');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."transcript_speaker" AS ENUM('caller', 'agent');--> statement-breakpoint
CREATE TABLE "agent_configurations" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"greeting" text NOT NULL,
	"instructions" text NOT NULL,
	"voice_provider" text DEFAULT 'openai' NOT NULL,
	"model" text NOT NULL,
	"voice" text NOT NULL,
	"language" text DEFAULT 'ro' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"calendar_connection_id" uuid NOT NULL,
	"caller_name" text NOT NULL,
	"caller_phone" text NOT NULL,
	"vehicle" jsonb NOT NULL,
	"issue" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"external_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_request_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "appointment_external_event_unique" UNIQUE("company_id","calendar_connection_id","external_event_id"),
	CONSTRAINT "appointment_interval_check" CHECK ("appointments"."ends_at" > "appointments"."starts_at"),
	CONSTRAINT "appointment_confirmation_check" CHECK ("appointments"."status" <> 'confirmed' or "appointments"."external_event_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_hours_window_unique" UNIQUE("company_id","weekday","opens_at"),
	CONSTRAINT "business_hours_weekday_check" CHECK ("business_hours"."weekday" between 1 and 7),
	CONSTRAINT "business_hours_order_check" CHECK ("business_hours"."opens_at" < "business_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"external_calendar_id" text NOT NULL,
	"credential_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connections_company_id_unique" UNIQUE("company_id"),
	CONSTRAINT "calendar_company_id_unique" UNIQUE("company_id","id")
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"phone_configuration_id" uuid NOT NULL,
	"telephony_provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_call_id" text NOT NULL,
	"voice_provider" text,
	"voice_session_id" text,
	"caller_phone" text,
	"caller_name" text,
	"vehicle" jsonb,
	"issue" text,
	"status" "call_status" DEFAULT 'ringing' NOT NULL,
	"appointment_outcome" "appointment_outcome" DEFAULT 'not_requested' NOT NULL,
	"summary" text,
	"started_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "call_provider_id_unique" UNIQUE("telephony_provider","provider_account_id","provider_call_id"),
	CONSTRAINT "call_duration_check" CHECK ("calls"."duration_seconds" is null or "calls"."duration_seconds" >= 0),
	CONSTRAINT "call_answered_check" CHECK ("calls"."answered_at" is null or "calls"."answered_at" >= "calls"."started_at"),
	CONSTRAINT "call_ended_check" CHECK ("calls"."ended_at" is null or ("calls"."ended_at" >= "calls"."started_at" and ("calls"."answered_at" is null or "calls"."ended_at" >= "calls"."answered_at")))
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Bucharest' NOT NULL,
	"locale" text DEFAULT 'ro-RO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "company_memberships" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_memberships_company_id_user_id_pk" PRIMARY KEY("company_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"phone_number" text NOT NULL,
	"credential_reference" text NOT NULL,
	"human_transfer_number" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_configurations_phone_number_unique" UNIQUE("phone_number"),
	CONSTRAINT "phone_company_id_unique" UNIQUE("company_id","id")
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"call_id" uuid,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" "event_status" DEFAULT 'pending' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "provider_event_unique" UNIQUE("provider","provider_account_id","provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"duration_minutes" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "service_duration_check" CHECK ("services"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "transcript_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"provider_item_id" text,
	"speaker" "transcript_speaker" NOT NULL,
	"text" text NOT NULL,
	"offset_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_call_sequence_unique" UNIQUE("company_id","call_id","sequence"),
	CONSTRAINT "transcript_call_item_unique" UNIQUE("company_id","call_id","provider_item_id"),
	CONSTRAINT "transcript_sequence_check" CHECK ("transcript_entries"."sequence" >= 0),
	CONSTRAINT "transcript_offset_check" CHECK ("transcript_entries"."offset_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_subject_unique" UNIQUE("auth_subject")
);
--> statement-breakpoint
ALTER TABLE "agent_configurations" ADD CONSTRAINT "agent_configurations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointment_call_tenant_fk" FOREIGN KEY ("company_id","call_id") REFERENCES "public"."calls"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointment_service_tenant_fk" FOREIGN KEY ("company_id","service_id") REFERENCES "public"."services"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointment_calendar_tenant_fk" FOREIGN KEY ("company_id","calendar_connection_id") REFERENCES "public"."calendar_connections"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "call_phone_tenant_fk" FOREIGN KEY ("company_id","phone_configuration_id") REFERENCES "public"."phone_configurations"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_configurations" ADD CONSTRAINT "phone_configurations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_event_call_tenant_fk" FOREIGN KEY ("company_id","call_id") REFERENCES "public"."calls"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_entries" ADD CONSTRAINT "transcript_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_entries" ADD CONSTRAINT "transcript_call_tenant_fk" FOREIGN KEY ("company_id","call_id") REFERENCES "public"."calls"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_company_start_idx" ON "appointments" USING btree ("company_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_company_call_idx" ON "appointments" USING btree ("company_id","call_id");--> statement-breakpoint
CREATE INDEX "calls_company_started_idx" ON "calls" USING btree ("company_id","started_at");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "company_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "faqs_company_order_idx" ON "faqs" USING btree ("company_id","sort_order");--> statement-breakpoint
CREATE INDEX "provider_events_pending_idx" ON "provider_events" USING btree ("company_id","status","received_at");