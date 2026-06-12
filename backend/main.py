import os
import re
import tempfile
import mailbox
import shutil
import csv
from io import StringIO
from typing import List, Dict, Any
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from bs4 import BeautifulSoup

# Relative imports from ml/classifier and pdf_generator
from ml.classifier import EmailClassifier
from .pdf_generator import generate_report_pdf




# Pydantic Schemas
class SinglePredictRequest(BaseModel):
    text: str

class ExportPDFRequest(BaseModel):
    results: List[Dict[str, Any]]
    summary: Dict[str, Any]

class ExportCSVRequest(BaseModel):
    results: List[Dict[str, Any]]

# Initialize FastAPI
app = FastAPI(
    title="Intelligent Spam & Ham Detection API",
    description="Full-stack AI classification system with Naive Bayes, MBOX parsing, and FPDF reporting.",
    version="1.0.0"
)

# Enable CORS for Vite Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Classifier
classifier = None

@app.on_event("startup")
def startup_event():
    global classifier
    try:
        classifier = EmailClassifier()
        print("Classifier model and vectorizer successfully loaded.")
    except Exception as e:
        print(f"Error loading classifier: {e}")
        # We don't crash the server startup, but handle it gracefully
        classifier = None

def get_classifier():
    if classifier is None:
        raise HTTPException(status_code=503, detail="ML Classifier Model not loaded. Please train the model first.")
    return classifier

# ----------------- BS4 HTML Cleaner Helper -----------------
def clean_html_body(raw_body: str) -> str:
    if not raw_body:
        return ""
    # Use BeautifulSoup to strip HTML tags if HTML is present
    if "<html" in raw_body.lower() or "<div" in raw_body.lower() or "<p" in raw_body.lower() or "<body" in raw_body.lower():
        try:
            soup = BeautifulSoup(raw_body, "html.parser")
            # Extract plain text
            return soup.get_text(separator=" ").strip()
        except Exception:
            pass
    # Fallback to simple regex if BeautifulSoup fails or HTML parsing is not needed
    return raw_body.strip()

# ----------------- MBOX/TXT Parsing Helpers -----------------
def parse_mbox_file(filepath: str) -> List[Dict[str, Any]]:
    clf = get_classifier()
    parsed_emails = []
    
    # Load MBOX file
    mbox = mailbox.mbox(filepath)
    try:
        for idx, msg in enumerate(mbox):
            subject = msg.get("subject", "(No Subject)")
            sender = msg.get("from", "(Unknown Sender)")
            date = msg.get("date", "(No Date)")
            
            # Extract body
            body = ""
            if msg.is_multipart():
                for part in msg.walk():
                    content_type = part.get_content_type()
                    content_disp = str(part.get("Content-Disposition", ""))
                    if "attachment" not in content_disp:
                        if content_type == "text/plain":
                            payload = part.get_payload(decode=True)
                            if payload:
                                body += payload.decode(errors="replace")
                        elif content_type == "text/html":
                            payload = part.get_payload(decode=True)
                            if payload:
                                body += clean_html_body(payload.decode(errors="replace"))
            else:
                payload = msg.get_payload(decode=True)
                if payload:
                    content_type = msg.get_content_type()
                    raw_text = payload.decode(errors="replace")
                    if content_type == "text/html":
                        body += clean_html_body(raw_text)
                    else:
                        body += raw_text
            
            body_text = body.strip()
            # Predict
            pred_res = clf.predict(body_text if body_text else subject)
            
            parsed_emails.append({
                "id": idx + 1,
                "subject": subject,
                "sender": sender,
                "date": date,
                "body_preview": body_text[:200] + ("..." if len(body_text) > 200 else ""),
                "prediction": pred_res["prediction"],
                "confidence": pred_res["confidence"],
                "probabilities": pred_res["probabilities"]
            })
    finally:
        mbox.close()
        
    return parsed_emails

def parse_txt_file(content: str) -> List[Dict[str, Any]]:
    clf = get_classifier()
    parsed_emails = []
    
    # Determine delimiter
    # Check if we have typical delimiter lines like --- or ===
    delimiters = [r'\n-+\n', r'\n=+\n', r'\n-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-\n']
    split_texts = []
    for d in delimiters:
        parts = re.split(d, content)
        if len(parts) > 1:
            split_texts = parts
            break
            
    # If no delimiter found, split by double newlines
    if not split_texts:
       split_texts = [content.strip()]
        
    for idx, raw_email in enumerate(split_texts):
        # Clean email text
        lines = raw_email.split("\n")
        subject = "(No Subject)"
        sender = "(Unknown Sender)"
        body_lines = []
        
        # Try to parse Subject: and From: header fields
        for line in lines:
            if line.lower().startswith("subject:"):
                subject = line[8:].strip()
            elif line.lower().startswith("from:"):
                sender = line[5:].strip()
            else:
                body_lines.append(line)
                
        body_text = "\n".join(body_lines).strip()
        if not body_text:
            body_text = raw_email # Fallback to the whole raw chunk if body parsing yielded nothing
            
        cleaned_body = clean_html_body(body_text)
        
        # Predict
        pred_res = clf.predict(cleaned_body)
        
        parsed_emails.append({
            "id": idx + 1,
            "subject": subject,
            "sender": sender,
            "date": "N/A",
            "body_preview": cleaned_body[:200] + ("..." if len(cleaned_body) > 200 else ""),
            "prediction": pred_res["prediction"],
            "confidence": pred_res["confidence"],
            "probabilities": pred_res["probabilities"]
        })
        
    return parsed_emails

# ----------------- Endpoints -----------------

@app.get("/")
def read_root():
    return {
        "status": "online",
        "system": "Intelligent Spam & Ham Detection System",
        "endpoints": {
            "single_prediction": "/api/predict/single",
            "batch_prediction": "/api/predict/batch",
            "export_pdf": "/api/export/pdf",
            "export_csv": "/api/export/csv"
        }
    }

@app.post("/api/predict/single")
def predict_single(payload: SinglePredictRequest):
    clf = get_classifier()
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Email body text cannot be empty.")
        
    # Clean HTML from inputs if present
    cleaned_text = clean_html_body(text)
    
    result = clf.predict(cleaned_text)
    return {
        "text_preview": cleaned_text[:150] + ("..." if len(cleaned_text) > 150 else ""),
        "prediction": result["prediction"],
        "confidence": result["confidence"],
        "probabilities": result["probabilities"]
    }

@app.post("/api/predict/batch")
async def predict_batch(file: UploadFile = File(...)):
    filename = file.filename
    content_type = file.content_type
    
    # Setup temporary directory inside our workspace (backend/temp_uploads)
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    temp_dir = os.path.join(backend_dir, "temp_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    
    # Save the file locally to inspect/parse
    temp_file_path = os.path.join(temp_dir, f"upload_{tempfile.mktemp(dir='')}_{filename}")
    
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Determine parsing strategy based on file content and extension
        if filename.endswith(".mbox") or content_type == "application/octet-stream":
            # Check if it resembles MBOX format (must start with "From ")
            # Many MBOX files start with "From " on line 1. Let's read first few bytes.
            is_mbox = False
            with open(temp_file_path, "r", encoding="utf-8", errors="ignore") as f:
                first_line = f.readline()
                if first_line.startswith("From "):
                    is_mbox = True
            
            if is_mbox or filename.endswith(".mbox"):
                results = parse_mbox_file(temp_file_path)
            else:
                # Fallback to text parsing
                with open(temp_file_path, "r", encoding="utf-8", errors="ignore") as f:
                    file_content = f.read()
                results = parse_txt_file(file_content)
        else:
            # Text file parsing
            with open(temp_file_path, "r", encoding="utf-8", errors="ignore") as f:
                file_content = f.read()
            results = parse_txt_file(file_content)
            
        return {
            "filename": filename,
            "total_records": len(results),
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process mailbox file: {str(e)}")
    finally:
        # Clean up temp file safely
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.post("/api/export/pdf")
def export_pdf(payload: ExportPDFRequest):
    try:
        pdf_bytes = generate_report_pdf(payload.results, payload.summary)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=classification_report.pdf",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF report: {str(e)}")

@app.post("/api/export/csv")
def export_csv(payload: ExportCSVRequest):
    try:
        output = StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow(["ID", "Subject", "Sender", "Date", "Prediction", "Confidence (Spam)", "Confidence (Ham)"])
        
        for item in payload.results:
            writer.writerow([
                item.get("id", ""),
                item.get("subject", ""),
                item.get("sender", ""),
                item.get("date", ""),
                item.get("prediction", ""),
                f"{item.get('probabilities', {}).get('spam', 0.0):.4f}",
                f"{item.get('probabilities', {}).get('ham', 0.0):.4f}"
            ])
            
        csv_data = output.getvalue()
        output.close()
        
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=classification_report.csv",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate CSV: {str(e)}")
