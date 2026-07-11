"use server";

import { db } from "@/lib/db";

function getOwnerFolder(candidateId: string): string {
  return (candidateId || "unassigned").replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * DPDP-compliant right-to-erase function.
 * Deletes all database rows and Azure Blob Storage files for a candidate.
 */
export async function purgeCandidateDataAction(candidateId: string) {
  const targetCandidateId = String(candidateId || "").trim();
  if (!targetCandidateId) {
    return { success: false, error: "Candidate ID is required." };
  }

  try {
    console.log(`[DPDP Purge] Starting data deletion for candidate: ${targetCandidateId}`);

    // 1. Fetch sessions to identify interview IDs for artifacts deletion
    const sessionsRes = await db.query(
      "SELECT id FROM sessions WHERE candidate_id = $1",
      [targetCandidateId]
    );
    const sessionIds = sessionsRes.rows.map((r) => r.id);

    // 2. Setup Azure Storage connection if configured
    const sasUrl = process.env.AZURE_STORAGE_SAS_URL;
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const hasStorage = sasUrl || connectionString;

    if (hasStorage) {
      const { BlobServiceClient, ContainerClient } = await import("@azure/storage-blob");
      
      const getContainer = (containerName: string): any => {
        if (sasUrl) {
          // If using SAS URL, we expect the SAS URL to point to the container directly 
          // or we derive client from the service URL
          if (sasUrl.includes(containerName)) {
            return new ContainerClient(sasUrl);
          }
          const serviceClient = new BlobServiceClient(sasUrl);
          return serviceClient.getContainerClient(containerName);
        } else {
          const serviceClient = BlobServiceClient.fromConnectionString(connectionString!);
          return serviceClient.getContainerClient(containerName);
        }
      };

      const ownerFolder = getOwnerFolder(targetCandidateId);

      // A. Delete files in "interview-artifacts" container (webm recordings, html reports, violation images)
      try {
        const artifactsContainer = getContainer("interview-artifacts");
        const exists = await artifactsContainer.exists().catch(() => false);
        if (exists) {
          // Delete all blobs under candidate folder: candidateId_sanitized/*
          for await (const blob of artifactsContainer.listBlobsFlat({ prefix: `${ownerFolder}/` })) {
            console.log(`[DPDP Purge] Deleting artifact blob: ${blob.name}`);
            await artifactsContainer.deleteBlob(blob.name);
          }
        }
      } catch (err) {
        console.warn("[DPDP Purge] Warning deleting from interview-artifacts:", err);
      }

      // B. Delete files in "candidate-documents" container (Resume & JD PDFs)
      try {
        const docsContainer = getContainer("candidate-documents");
        const exists = await docsContainer.exists().catch(() => false);
        if (exists) {
          // Delete all documents uploaded under candidate ID prefix: candidateId/*
          for await (const blob of docsContainer.listBlobsFlat({ prefix: `${targetCandidateId}/` })) {
            console.log(`[DPDP Purge] Deleting document blob: ${blob.name}`);
            await docsContainer.deleteBlob(blob.name);
          }
        }
      } catch (err) {
        console.warn("[DPDP Purge] Warning deleting from candidate-documents:", err);
      }

      // C. Delete files in "candidate-selfies" container (Selfies)
      try {
        const selfiesContainer = getContainer("candidate-selfies");
        const exists = await selfiesContainer.exists().catch(() => false);
        if (exists) {
          for await (const blob of selfiesContainer.listBlobsFlat({ prefix: `${targetCandidateId}/` })) {
            console.log(`[DPDP Purge] Deleting selfie blob: ${blob.name}`);
            await selfiesContainer.deleteBlob(blob.name);
          }
        }
      } catch (err) {
        console.warn("[DPDP Purge] Warning deleting from candidate-selfies:", err);
      }
    } else {
      console.log("[DPDP Purge] Azure storage connection not set up. Skipping blob storage deletion.");
    }

    // 3. PostgreSQL Deletion (with strict execution order to prevent FK constraints failure)
    // A. Clean up violation_events
    if (sessionIds.length > 0) {
      await db.query(
        "DELETE FROM violation_events WHERE session_id = ANY($1)",
        [sessionIds]
      );
    }

    // B. Clean up sessions
    await db.query(
      "DELETE FROM sessions WHERE candidate_id = $1",
      [targetCandidateId]
    );

    // C. Clean up candidates table row
    const deleteCandRes = await db.query(
      "DELETE FROM candidates WHERE id = $1",
      [targetCandidateId]
    );

    console.log(`[DPDP Purge] Successfully deleted candidate records from PostgreSQL. Row count: ${deleteCandRes.rowCount}`);

    return { success: true, purgedSessionsCount: sessionIds.length };
  } catch (error) {
    console.error("[DPDP Purge] Error performing database/storage purge:", error);
    return { success: false, error: String(error) };
  }
}
