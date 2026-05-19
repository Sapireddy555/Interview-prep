import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer";

const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || "";
const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || "";

export async function verifyAadharWithADI(imageDataUri: string) {
  if (!endpoint || !key) {
    console.warn("Azure Document Intelligence credentials missing. Falling back to mock success for development.");
    return { verified: true, message: "[Mock] Azure Credentials Missing - Permitting Access", aadharNumber: "123456789012" };
  }

  try {
    // 1. Prepare the buffer from Data URI
    const base64Data = imageDataUri.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");

    // 2. Initialize Client
    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));

    // 3. Analyze Document using prebuilt-idDocument
    const poller = await client.beginAnalyzeDocument("prebuilt-idDocument", buffer);
    const { documents } = await poller.pollUntilDone();

    if (!documents || documents.length === 0) {
      return { verified: false, message: "No document detected in the frame." };
    }

    const doc = documents[0];
    const fields = doc.fields as any;
    const documentType = doc.docType;

    // 4. Extract Aadhar Number (DocumentNumber) and Name (FirstName/LastName)
    const aadharNumber = fields.DocumentNumber?.valueString?.replace(/\s/g, "") || fields.DocumentNumber?.content?.replace(/\s/g, "");
    const firstName = fields.FirstName?.valueString || fields.FirstName?.content;
    const lastName = fields.LastName?.valueString || fields.LastName?.content;
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    console.log("ADI Extracted:", { aadharNumber, fullName, documentType });

    // 5. Validation Logic
    const hasValidAadhar = aadharNumber && /^\d{12}$/.test(aadharNumber);
    const hasName = !!fullName;

    if (hasValidAadhar || hasName) {
      let successMessage = "ID Verified successfully.";
      if (!hasValidAadhar && hasName) {
        successMessage = `Verified via Name: ${fullName} (Number Not Found)`;
      } else if (hasValidAadhar) {
        successMessage = `Verified Aadhar: ${aadharNumber.substring(0,4)} XXXX XXXX`;
      }

      return {
        verified: true,
        message: successMessage,
        aadharNumber: aadharNumber || "N/A",
        name: fullName || "N/A"
      };
    }

    // Specific feedback based on what Azure detected
    if (documentType && !documentType.includes("idDocument")) {
      return { verified: false, message: `Detected a different document type (${documentType}). Please ensure it's a clear Aadhar card.` };
    }

    return { verified: false, message: "Could not extract a valid 12-digit Aadhar number or Name. Please ensure better lighting and avoid glare." };

  } catch (error) {
    console.error("Azure Document Intelligence Error:", error);
    return { verified: false, message: "Error communicating with verification service." };
  }
}

export async function extractTextWithADI(file: File) {
  if (!endpoint || !key) {
    console.warn("Azure Document Intelligence credentials missing. PDF text extraction skipped.");
    return "";
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
    const poller = await client.beginAnalyzeDocument("prebuilt-read", buffer);
    const result = await poller.pollUntilDone();

    return (result.content || "").trim();
  } catch (error) {
    console.error("Azure Document Intelligence PDF extraction error:", error);
    return "";
  }
}
