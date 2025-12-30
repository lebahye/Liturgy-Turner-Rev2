import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { 
  users, uploadedFiles, trainingSessions, pageMarkers, aggregatedFingerprints, pageTranscripts,
  learningAttempts, learningAttemptPages,
  type User, type InsertUser, 
  type UploadedFile, type InsertFile,
  type TrainingSession, type InsertTrainingSession,
  type PageMarker, type InsertPageMarker,
  type AggregatedFingerprint, type InsertAggregatedFingerprint,
  type PageTranscript, type InsertPageTranscript,
  type LearningAttempt, type InsertLearningAttempt,
  type LearningAttemptPage, type InsertLearningAttemptPage
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getUploadedFiles(fileType?: string): Promise<UploadedFile[]>;
  getUploadedFile(id: string): Promise<UploadedFile | undefined>;
  createUploadedFile(file: InsertFile): Promise<UploadedFile>;
  deleteUploadedFile(id: string): Promise<boolean>;

  getTrainingSessions(): Promise<TrainingSession[]>;
  getTrainingSession(id: string): Promise<TrainingSession | undefined>;
  createTrainingSession(session: InsertTrainingSession): Promise<TrainingSession>;
  updateTrainingSession(id: string, updates: Partial<TrainingSession>): Promise<TrainingSession | undefined>;
  deleteTrainingSession(id: string): Promise<boolean>;

  getPageMarkers(sessionId: string): Promise<PageMarker[]>;
  createPageMarker(marker: InsertPageMarker): Promise<PageMarker>;
  createPageMarkers(markers: InsertPageMarker[]): Promise<PageMarker[]>;
  deletePageMarkers(sessionId: string): Promise<boolean>;

  getAggregatedFingerprints(pdfPath: string): Promise<AggregatedFingerprint[]>;
  getAggregatedFingerprintsByPdfId(pdfId: string): Promise<AggregatedFingerprint[]>;
  getAggregatedFingerprint(pdfPath: string, pageNumber: number): Promise<AggregatedFingerprint | undefined>;
  getAggregatedFingerprintByPageId(pageId: string): Promise<AggregatedFingerprint | undefined>;
  upsertAggregatedFingerprint(fingerprint: InsertAggregatedFingerprint): Promise<AggregatedFingerprint>;
  deleteAggregatedFingerprints(pdfPath: string): Promise<boolean>;

  getPageTranscripts(pdfPath: string): Promise<PageTranscript[]>;
  getPageTranscript(pdfPath: string, pageNumber: number): Promise<PageTranscript | undefined>;
  getPageTranscriptsByPdfId(pdfId: string): Promise<PageTranscript[]>;
  getPageTranscriptByPdfId(pdfId: string, pageNumber: number): Promise<PageTranscript | undefined>;
  upsertPageTranscript(transcript: InsertPageTranscript): Promise<PageTranscript>;
  deletePageTranscripts(pdfPath: string): Promise<boolean>;

  // Learning attempts - separate storage for each learning run
  getLearningAttempts(pdfPath: string): Promise<LearningAttempt[]>;
  getLearningAttempt(id: string): Promise<LearningAttempt | undefined>;
  createLearningAttempt(attempt: InsertLearningAttempt): Promise<LearningAttempt>;
  updateLearningAttempt(id: string, updates: Partial<LearningAttempt>): Promise<LearningAttempt | undefined>;
  deleteLearningAttempt(id: string): Promise<boolean>;
  
  getLearningAttemptPages(attemptId: string): Promise<LearningAttemptPage[]>;
  createLearningAttemptPage(page: InsertLearningAttemptPage): Promise<LearningAttemptPage>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUploadedFiles(fileType?: string): Promise<UploadedFile[]> {
    if (fileType) {
      return db.select().from(uploadedFiles).where(eq(uploadedFiles.fileType, fileType));
    }
    return db.select().from(uploadedFiles);
  }

  async getUploadedFile(id: string): Promise<UploadedFile | undefined> {
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id));
    return file;
  }

  async createUploadedFile(insertFile: InsertFile): Promise<UploadedFile> {
    const [file] = await db.insert(uploadedFiles).values(insertFile).returning();
    return file;
  }

  async deleteUploadedFile(id: string): Promise<boolean> {
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));
    return true;
  }

  async getTrainingSessions(): Promise<TrainingSession[]> {
    return db.select().from(trainingSessions).orderBy(trainingSessions.createdAt);
  }

  async getTrainingSession(id: string): Promise<TrainingSession | undefined> {
    const [session] = await db.select().from(trainingSessions).where(eq(trainingSessions.id, id));
    return session;
  }

  async createTrainingSession(session: InsertTrainingSession): Promise<TrainingSession> {
    const [created] = await db.insert(trainingSessions).values(session).returning();
    return created;
  }

  async updateTrainingSession(id: string, updates: Partial<TrainingSession>): Promise<TrainingSession | undefined> {
    const [updated] = await db.update(trainingSessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(trainingSessions.id, id))
      .returning();
    return updated;
  }

  async deleteTrainingSession(id: string): Promise<boolean> {
    await db.delete(pageMarkers).where(eq(pageMarkers.sessionId, id));
    await db.delete(trainingSessions).where(eq(trainingSessions.id, id));
    return true;
  }

  async getPageMarkers(sessionId: string): Promise<PageMarker[]> {
    return db.select().from(pageMarkers)
      .where(eq(pageMarkers.sessionId, sessionId))
      .orderBy(pageMarkers.timestampMs);
  }

  async createPageMarker(marker: InsertPageMarker): Promise<PageMarker> {
    const [created] = await db.insert(pageMarkers).values(marker).returning();
    return created;
  }

  async createPageMarkers(markers: InsertPageMarker[]): Promise<PageMarker[]> {
    if (markers.length === 0) return [];
    return db.insert(pageMarkers).values(markers).returning();
  }

  async deletePageMarkers(sessionId: string): Promise<boolean> {
    await db.delete(pageMarkers).where(eq(pageMarkers.sessionId, sessionId));
    return true;
  }

  async getAggregatedFingerprints(pdfPath: string): Promise<AggregatedFingerprint[]> {
    return db.select().from(aggregatedFingerprints)
      .where(eq(aggregatedFingerprints.pdfPath, pdfPath))
      .orderBy(aggregatedFingerprints.pageNumber);
  }

  async getAggregatedFingerprintsByPdfId(pdfId: string): Promise<AggregatedFingerprint[]> {
    return db.select().from(aggregatedFingerprints)
      .where(eq(aggregatedFingerprints.pdfId, pdfId))
      .orderBy(aggregatedFingerprints.pageNumber);
  }

  async getAggregatedFingerprint(pdfPath: string, pageNumber: number): Promise<AggregatedFingerprint | undefined> {
    const [fingerprint] = await db.select().from(aggregatedFingerprints)
      .where(and(
        eq(aggregatedFingerprints.pdfPath, pdfPath),
        eq(aggregatedFingerprints.pageNumber, pageNumber)
      ));
    return fingerprint;
  }

  async getAggregatedFingerprintByPageId(pageId: string): Promise<AggregatedFingerprint | undefined> {
    const [fingerprint] = await db.select().from(aggregatedFingerprints)
      .where(eq(aggregatedFingerprints.pageId, pageId));
    return fingerprint;
  }

  async upsertAggregatedFingerprint(fingerprint: InsertAggregatedFingerprint): Promise<AggregatedFingerprint> {
    const existing = await this.getAggregatedFingerprint(fingerprint.pdfPath, fingerprint.pageNumber);
    
    if (existing) {
      const [updated] = await db.update(aggregatedFingerprints)
        .set({
          sessionCount: fingerprint.sessionCount,
          averageTimestampMs: fingerprint.averageTimestampMs,
          averagedFeatures: fingerprint.averagedFeatures,
          featureHistory: fingerprint.featureHistory,
          confidence: fingerprint.confidence,
          updatedAt: new Date(),
        })
        .where(eq(aggregatedFingerprints.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(aggregatedFingerprints).values(fingerprint).returning();
      return created;
    }
  }

  async deleteAggregatedFingerprints(pdfPath: string): Promise<boolean> {
    await db.delete(aggregatedFingerprints).where(eq(aggregatedFingerprints.pdfPath, pdfPath));
    return true;
  }

  async getPageTranscripts(pdfPath: string): Promise<PageTranscript[]> {
    return db.select().from(pageTranscripts)
      .where(eq(pageTranscripts.pdfPath, pdfPath))
      .orderBy(pageTranscripts.pageNumber);
  }

  async getPageTranscript(pdfPath: string, pageNumber: number): Promise<PageTranscript | undefined> {
    const [transcript] = await db.select().from(pageTranscripts)
      .where(and(
        eq(pageTranscripts.pdfPath, pdfPath),
        eq(pageTranscripts.pageNumber, pageNumber)
      ));
    return transcript;
  }

  async getPageTranscriptsByPdfId(pdfId: string): Promise<PageTranscript[]> {
    return db.select().from(pageTranscripts)
      .where(eq(pageTranscripts.pdfId, pdfId))
      .orderBy(pageTranscripts.pageNumber);
  }

  async getPageTranscriptByPdfId(pdfId: string, pageNumber: number): Promise<PageTranscript | undefined> {
    const [transcript] = await db.select().from(pageTranscripts)
      .where(and(
        eq(pageTranscripts.pdfId, pdfId),
        eq(pageTranscripts.pageNumber, pageNumber)
      ));
    return transcript;
  }

  async upsertPageTranscript(transcript: InsertPageTranscript): Promise<PageTranscript> {
    const existing = await this.getPageTranscript(transcript.pdfPath, transcript.pageNumber);
    
    if (existing) {
      const [updated] = await db.update(pageTranscripts)
        .set({
          transcript: transcript.transcript,
          keywords: transcript.keywords,
          sessionCount: transcript.sessionCount,
          updatedAt: new Date(),
        })
        .where(eq(pageTranscripts.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(pageTranscripts).values(transcript).returning();
      return created;
    }
  }

  async deletePageTranscripts(pdfPath: string): Promise<boolean> {
    await db.delete(pageTranscripts).where(eq(pageTranscripts.pdfPath, pdfPath));
    return true;
  }

  // Learning attempts implementation
  async getLearningAttempts(pdfPath: string): Promise<LearningAttempt[]> {
    return db.select().from(learningAttempts)
      .where(eq(learningAttempts.pdfPath, pdfPath))
      .orderBy(desc(learningAttempts.createdAt));
  }

  async getLearningAttempt(id: string): Promise<LearningAttempt | undefined> {
    const [attempt] = await db.select().from(learningAttempts).where(eq(learningAttempts.id, id));
    return attempt;
  }

  async createLearningAttempt(attempt: InsertLearningAttempt): Promise<LearningAttempt> {
    const [created] = await db.insert(learningAttempts).values(attempt).returning();
    return created;
  }

  async updateLearningAttempt(id: string, updates: Partial<LearningAttempt>): Promise<LearningAttempt | undefined> {
    const [updated] = await db.update(learningAttempts)
      .set(updates)
      .where(eq(learningAttempts.id, id))
      .returning();
    return updated;
  }

  async deleteLearningAttempt(id: string): Promise<boolean> {
    // Delete pages first (cascade)
    await db.delete(learningAttemptPages).where(eq(learningAttemptPages.attemptId, id));
    await db.delete(learningAttempts).where(eq(learningAttempts.id, id));
    return true;
  }

  async getLearningAttemptPages(attemptId: string): Promise<LearningAttemptPage[]> {
    return db.select().from(learningAttemptPages)
      .where(eq(learningAttemptPages.attemptId, attemptId))
      .orderBy(learningAttemptPages.pageNumber);
  }

  async createLearningAttemptPage(page: InsertLearningAttemptPage): Promise<LearningAttemptPage> {
    const [created] = await db.insert(learningAttemptPages).values(page).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
