import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull(),
  mimeType: text("mime_type").notNull(),
  // Optional stable identifier for PDFs (sha256 of file bytes)
  pdfId: text("pdf_id"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const trainingSessions = pgTable("training_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Legacy key
  pdfPath: text("pdf_path").notNull(),
  // Stable key (sha256 of PDF bytes)
  pdfId: text("pdf_id"),
  audioPath: text("audio_path"),
  status: text("status").notNull().default("pending"),
  totalPages: integer("total_pages").notNull().default(1),
  sampleRate: integer("sample_rate").default(44100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pageMarkers = pgTable("page_markers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => trainingSessions.id),
  // Stable keys for cross-PDF reuse
  pdfId: text("pdf_id"),
  pageId: text("page_id"),
  pageNumber: integer("page_number").notNull(),
  timestampMs: integer("timestamp_ms").notNull(),
  audioFeatures: jsonb("audio_features"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aggregatedFingerprints = pgTable("aggregated_fingerprints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Legacy key
  pdfPath: text("pdf_path").notNull(),
  // Stable keys
  pdfId: text("pdf_id"),
  pageId: text("page_id"),
  pageNumber: integer("page_number").notNull(),
  sessionCount: integer("session_count").notNull().default(1),
  averageTimestampMs: integer("average_timestamp_ms").notNull(),
  averagedFeatures: jsonb("averaged_features"),
  featureHistory: jsonb("feature_history"),
  confidence: real("confidence").default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pageTranscripts = pgTable("page_transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Legacy key
  pdfPath: text("pdf_path").notNull(),
  // Stable keys
  pdfId: text("pdf_id"),
  pageId: text("page_id"),
  pageNumber: integer("page_number").notNull(),
  transcript: text("transcript").notNull(),
  keywords: text("keywords").array(),
  sessionCount: integer("session_count").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Stores each learning attempt separately for comparison
export const learningAttempts = pgTable("learning_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Legacy key
  pdfPath: text("pdf_path").notNull(),
  // Stable key (sha256 of PDF bytes)
  pdfId: text("pdf_id"),
  audioPath: text("audio_path").notNull(),
  name: text("name"), // Optional name for the attempt
  status: text("status").notNull().default("completed"),
  pagesProcessed: integer("pages_processed").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Stores transcription results for each page in a learning attempt
export const learningAttemptPages = pgTable("learning_attempt_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attemptId: varchar("attempt_id").notNull().references(() => learningAttempts.id),
  pageNumber: integer("page_number").notNull(),
  transcript: text("transcript").notNull(),
  duration: real("duration"), // Duration of audio segment in seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPageTranscriptSchema = createInsertSchema(pageTranscripts).omit({
  id: true,
  updatedAt: true,
});

export const insertLearningAttemptSchema = createInsertSchema(learningAttempts).omit({
  id: true,
  createdAt: true,
});

export const insertLearningAttemptPageSchema = createInsertSchema(learningAttemptPages).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  uploadedAt: true,
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPageMarkerSchema = createInsertSchema(pageMarkers).omit({
  id: true,
  createdAt: true,
});

export const insertAggregatedFingerprintSchema = createInsertSchema(aggregatedFingerprints).omit({
  id: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type TrainingSession = typeof trainingSessions.$inferSelect;
export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type PageMarker = typeof pageMarkers.$inferSelect;
export type InsertPageMarker = z.infer<typeof insertPageMarkerSchema>;
export type AggregatedFingerprint = typeof aggregatedFingerprints.$inferSelect;
export type InsertAggregatedFingerprint = z.infer<typeof insertAggregatedFingerprintSchema>;
export type PageTranscript = typeof pageTranscripts.$inferSelect;
export type InsertPageTranscript = z.infer<typeof insertPageTranscriptSchema>;
export type LearningAttempt = typeof learningAttempts.$inferSelect;
export type InsertLearningAttempt = z.infer<typeof insertLearningAttemptSchema>;
export type LearningAttemptPage = typeof learningAttemptPages.$inferSelect;
export type InsertLearningAttemptPage = z.infer<typeof insertLearningAttemptPageSchema>;

export * from "./models/chat";
