import { sql } from "drizzle-orm";
import {
  bigint, boolean, check, foreignKey, index, integer, jsonb, pgEnum,
  pgTable, primaryKey, text, time, timestamp, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import type { RequestDetails } from "@/lib/validation";

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const companyId = () => uuid("company_id").notNull().references(() => companies.id);

export const membershipRole = pgEnum("membership_role", ["owner", "member"]);
export const callStatus = pgEnum("call_status", ["ringing", "active", "completed", "transferred", "failed", "missed"]);
export const appointmentOutcome = pgEnum("appointment_outcome", ["not_requested", "pending", "booked", "unavailable", "failed"]);
export const appointmentStatus = pgEnum("appointment_status", ["pending", "confirmed", "failed", "cancelled"]);
export const transcriptSpeaker = pgEnum("transcript_speaker", ["caller", "agent"]);
export const eventStatus = pgEnum("event_status", ["pending", "processed", "failed"]);

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").default("Europe/Bucharest").notNull(),
  locale: text("locale").default("ro-RO").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable("users", {
  id: id(),
  // Retained for compatibility with the initial schema; local auth uses id.
  authSubject: text("auth_subject").unique(),
  name: text("name").default("").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("users_email_normalized_unique").on(sql`lower(${table.email})`)]);

export const authSessions = pgTable("auth_sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("auth_sessions_user_idx").on(table.userId)]);

export const authAccounts = pgTable("auth_accounts", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("auth_accounts_user_idx").on(table.userId),
  unique("auth_accounts_provider_unique").on(table.providerId, table.accountId),
]);

export const authVerifications = pgTable("auth_verifications", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("auth_verifications_identifier_idx").on(table.identifier)]);

export const authRateLimits = pgTable("auth_rate_limits", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const companyMemberships = pgTable("company_memberships", {
  companyId: companyId(),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: membershipRole("role").default("member").notNull(),
  createdAt: createdAt(),
}, (table) => [
  primaryKey({ columns: [table.companyId, table.userId] }),
  index("memberships_user_idx").on(table.userId),
]);

export const businessHours = pgTable("business_hours", {
  id: id(),
  companyId: companyId(),
  weekday: integer("weekday").notNull(),
  opensAt: time("opens_at").notNull(),
  closesAt: time("closes_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique("business_hours_window_unique").on(table.companyId, table.weekday, table.opensAt),
  check("business_hours_weekday_check", sql`${table.weekday} between 1 and 7`),
  check("business_hours_order_check", sql`${table.opensAt} < ${table.closesAt}`),
]);

export const phoneConfigurations = pgTable("phone_configurations", {
  id: id(),
  companyId: companyId(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  phoneNumber: text("phone_number").notNull().unique(),
  credentialReference: text("credential_reference").notNull(),
  humanTransferNumber: text("human_transfer_number"),
  enabled: boolean("enabled").default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [unique("phone_company_id_unique").on(table.companyId, table.id)]);

export const services = pgTable("services", {
  id: id(),
  companyId: companyId(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique("service_company_id_unique").on(table.companyId, table.id),
  check("service_duration_check", sql`${table.durationMinutes} > 0`),
]);

export const faqs = pgTable("faqs", {
  id: id(),
  companyId: companyId(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("faqs_company_order_idx").on(table.companyId, table.sortOrder)]);

export const agentConfigurations = pgTable("agent_configurations", {
  companyId: companyId().primaryKey(),
  greeting: text("greeting").notNull(),
  instructions: text("instructions").notNull(),
  voiceProvider: text("voice_provider").default("openai").notNull(),
  model: text("model").notNull(),
  voice: text("voice").notNull(),
  language: text("language").default("ro").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const calendarConnections = pgTable("calendar_connections", {
  id: id(),
  companyId: companyId().unique(),
  provider: text("provider").default("google").notNull(),
  externalCalendarId: text("external_calendar_id").notNull(),
  credentialReference: text("credential_reference").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [unique("calendar_company_id_unique").on(table.companyId, table.id)]);

export const calls = pgTable("calls", {
  id: id(),
  companyId: companyId(),
  phoneConfigurationId: uuid("phone_configuration_id").notNull(),
  telephonyProvider: text("telephony_provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  providerCallId: text("provider_call_id").notNull(),
  voiceProvider: text("voice_provider"),
  voiceSessionId: text("voice_session_id"),
  callerPhone: text("caller_phone"),
  callerName: text("caller_name"),
  details: jsonb("details").$type<RequestDetails>(),
  issue: text("issue"),
  status: callStatus("status").default("ringing").notNull(),
  appointmentOutcome: appointmentOutcome("appointment_outcome").default("not_requested").notNull(),
  summary: text("summary"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique("call_company_id_unique").on(table.companyId, table.id),
  unique("call_provider_id_unique").on(table.telephonyProvider, table.providerAccountId, table.providerCallId),
  index("calls_company_started_idx").on(table.companyId, table.startedAt),
  foreignKey({ columns: [table.companyId, table.phoneConfigurationId], foreignColumns: [phoneConfigurations.companyId, phoneConfigurations.id], name: "call_phone_tenant_fk" }),
  check("call_duration_check", sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`),
  check("call_answered_check", sql`${table.answeredAt} is null or ${table.answeredAt} >= ${table.startedAt}`),
  check("call_ended_check", sql`${table.endedAt} is null or (${table.endedAt} >= ${table.startedAt} and (${table.answeredAt} is null or ${table.endedAt} >= ${table.answeredAt}))`),
]);

export const transcriptEntries = pgTable("transcript_entries", {
  id: id(),
  companyId: companyId(),
  callId: uuid("call_id").notNull(),
  sequence: integer("sequence").notNull(),
  providerItemId: text("provider_item_id"),
  speaker: transcriptSpeaker("speaker").notNull(),
  text: text("text").notNull(),
  offsetMs: integer("offset_ms").notNull(),
  createdAt: createdAt(),
}, (table) => [
  unique("transcript_call_sequence_unique").on(table.companyId, table.callId, table.sequence),
  unique("transcript_call_item_unique").on(table.companyId, table.callId, table.providerItemId),
  foreignKey({ columns: [table.companyId, table.callId], foreignColumns: [calls.companyId, calls.id], name: "transcript_call_tenant_fk" }),
  check("transcript_sequence_check", sql`${table.sequence} >= 0`),
  check("transcript_offset_check", sql`${table.offsetMs} >= 0`),
]);

export const appointments = pgTable("appointments", {
  id: id(),
  companyId: companyId(),
  callId: uuid("call_id").notNull(),
  serviceId: uuid("service_id").notNull(),
  calendarConnectionId: uuid("calendar_connection_id").notNull(),
  callerName: text("caller_name").notNull(),
  callerPhone: text("caller_phone").notNull(),
  details: jsonb("details").$type<RequestDetails>().default({}).notNull(),
  issue: text("issue").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: appointmentStatus("status").default("pending").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  externalEventId: text("external_event_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique("appointment_request_unique").on(table.companyId, table.idempotencyKey),
  unique("appointment_external_event_unique").on(table.companyId, table.calendarConnectionId, table.externalEventId),
  index("appointments_company_start_idx").on(table.companyId, table.startsAt),
  index("appointments_company_call_idx").on(table.companyId, table.callId),
  foreignKey({ columns: [table.companyId, table.callId], foreignColumns: [calls.companyId, calls.id], name: "appointment_call_tenant_fk" }),
  foreignKey({ columns: [table.companyId, table.serviceId], foreignColumns: [services.companyId, services.id], name: "appointment_service_tenant_fk" }),
  foreignKey({ columns: [table.companyId, table.calendarConnectionId], foreignColumns: [calendarConnections.companyId, calendarConnections.id], name: "appointment_calendar_tenant_fk" }),
  check("appointment_interval_check", sql`${table.endsAt} > ${table.startsAt}`),
  check("appointment_confirmation_check", sql`${table.status} <> 'confirmed' or ${table.externalEventId} is not null`),
]);

export const providerEvents = pgTable("provider_events", {
  id: id(),
  companyId: companyId(),
  callId: uuid("call_id"),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  eventType: text("event_type").notNull(),
  status: eventStatus("status").default("pending").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (table) => [
  unique("provider_event_unique").on(table.provider, table.providerAccountId, table.providerEventId),
  index("provider_events_pending_idx").on(table.companyId, table.status, table.receivedAt),
  foreignKey({ columns: [table.companyId, table.callId], foreignColumns: [calls.companyId, calls.id], name: "provider_event_call_tenant_fk" }),
]);
