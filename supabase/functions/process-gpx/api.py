
#!/usr/bin/env python3
import base64
import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
import cgi
import io
import traceback
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import Pretty GPX modules
from scripts import generate_poster, extract_metadata

class PrettyGPXHandler(BaseHTTPRequestHandler):
    def _set_headers(self, content_type="application/json"):
        self.send_response(200)
        self.send_header("Content-type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        
    def do_OPTIONS(self):
        self._set_headers()
        self.wfile.write(json.dumps({}).encode())
        
    def do_GET(self):
        """Health check endpoint"""
        self._set_headers()
        response = {
            "status": "healthy",
            "service": "Pretty GPX Processor",
            "version": "1.0.0"
        }
        self.wfile.write(json.dumps(response).encode())
        
    def do_POST(self):
        try:
            logger.info("Received POST request for GPX processing")
            
            content_length = int(self.headers["Content-Length"])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode("utf-8"))
            
            # Extract GPX content and options
            gpx_base64 = data.get("gpx_content", "")
            options = data.get("options", {})
            
            logger.info(f"Processing with options: {options}")
            
            if not gpx_base64:
                raise ValueError("No GPX content provided")
            
            # Decode the GPX file
            try:
                gpx_content = base64.b64decode(gpx_base64)
            except Exception as e:
                raise ValueError(f"Invalid base64 GPX content: {str(e)}")
            
            # Create a temporary file to store the GPX data
            with tempfile.NamedTemporaryFile(suffix=".gpx", delete=False) as temp_gpx:
                temp_gpx.write(gpx_content)
                temp_gpx_path = temp_gpx.name
                
            logger.info(f"Created temporary GPX file: {temp_gpx_path}")
                
            # Process the GPX file with our implementation
            try:
                metadata = extract_metadata(temp_gpx_path)
                logger.info(f"Extracted metadata: {metadata}")
                
                # Check if this is metadata-only request
                if options.get('metadataOnly'):
                    response = {
                        "metadata": metadata
                    }
                    
                    # Clean up temporary file
                    os.unlink(temp_gpx_path)
                    
                    self._set_headers()
                    self.wfile.write(json.dumps(response).encode())
                    return
                
                # Generate the poster
                image_path, pdf_path = generate_poster(temp_gpx_path, options)
                logger.info(f"Generated poster files: {image_path}, {pdf_path}")
                
                # Read the generated files
                with open(image_path, "rb") as img_file:
                    image_data = img_file.read()
                    
                with open(pdf_path, "rb") as pdf_file:
                    pdf_data = pdf_file.read()
                
                # Encode the data as base64 for JSON transmission
                response = {
                    "image_data": base64.b64encode(image_data).decode(),
                    "pdf_data": base64.b64encode(pdf_data).decode(),
                    "metadata": metadata
                }
                
                # Clean up temporary files
                os.unlink(temp_gpx_path)
                os.unlink(image_path)
                os.unlink(pdf_path)
                
                logger.info("Successfully processed GPX file")
                
                # Send the response
                self._set_headers()
                self.wfile.write(json.dumps(response).encode())
                
            except Exception as e:
                logger.error(f"Error during GPX processing: {str(e)}")
                # Clean up temporary file
                if os.path.exists(temp_gpx_path):
                    os.unlink(temp_gpx_path)
                raise
        
        except Exception as e:
            logger.error(f"Error handling request: {str(e)}")
            logger.error(traceback.format_exc())
            
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            error_response = {
                "error": str(e),
                "traceback": traceback.format_exc()
            }
            self.wfile.write(json.dumps(error_response).encode())

def run_server(port=8080):
    server_address = ("", port)
    httpd = HTTPServer(server_address, PrettyGPXHandler)
    logger.info(f"Starting Pretty GPX server on port {port}")
    print(f"Pretty GPX Processor server starting on port {port}")
    print("Health check available at: http://localhost:8080/")
    httpd.serve_forever()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    run_server(port)
