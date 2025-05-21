
#!/usr/bin/env python3
"""
Generate a poster from a GPX file
"""
import os
import gpxpy
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from matplotlib.figure import Figure
from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas
import io
import tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, LETTER, A3
from reportlab.lib import colors
from datetime import datetime, timedelta

def generate_poster(gpx_file, options):
    """
    Generate a poster from a GPX file
    """
    print(f"Generating poster from {gpx_file} with options: {options}")
    
    # Parse the GPX file
    with open(gpx_file, 'r') as gpx_file_content:
        gpx = gpxpy.parse(gpx_file_content)
    
    # Extract track points
    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                points.append((point.longitude, point.latitude, point.elevation, point.time))
    
    if not points:
        raise ValueError("No track points found in GPX file")
    
    # Extract coordinates for plotting
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    
    # Get metadata for the poster
    metadata = extract_metadata(gpx_file)
    
    # Create a figure with the right size based on options
    if options.get('paperSize') == 'a3':
        figsize = (11.7, 16.5) if options.get('orientation') == 'portrait' else (16.5, 11.7)
        pdf_size = A3
    elif options.get('paperSize') == 'letter':
        figsize = (8.5, 11) if options.get('orientation') == 'portrait' else (11, 8.5)
        pdf_size = LETTER
    else:  # Default to A4
        figsize = (8.3, 11.7) if options.get('orientation') == 'portrait' else (11.7, 8.3)
        pdf_size = A4
    
    # Create the figure with high DPI if requested
    dpi = 300 if options.get('highResolution') else 150
    fig = Figure(figsize=figsize, dpi=dpi)
    canvas = FigureCanvas(fig)
    ax = fig.add_subplot(111)
    
    # Set the style based on template and color scheme
    if options.get('template') == 'minimal':
        bgcolor = '#f8f9fa'
        linecolor = '#0077cc' if options.get('colorScheme') == 'default' else '#cc3300'
        ax.set_facecolor(bgcolor)
        fig.patch.set_facecolor(bgcolor)
    elif options.get('template') == 'topographic':
        bgcolor = '#e6f2e6'
        linecolor = '#228B22' if options.get('colorScheme') == 'default' else '#8B4513'
        ax.set_facecolor(bgcolor)
        fig.patch.set_facecolor(bgcolor)
    elif options.get('template') == 'detailed':
        bgcolor = '#f0f0f0'
        linecolor = '#333333' if options.get('colorScheme') == 'default' else '#800080'
        ax.set_facecolor(bgcolor)
        fig.patch.set_facecolor(bgcolor)
    else:  # Standard
        bgcolor = 'white'
        linecolor = '#2196F3' if options.get('colorScheme') == 'default' else '#FF5722'
        ax.set_facecolor(bgcolor)
        fig.patch.set_facecolor(bgcolor)
    
    # Plot the track with the specified line width
    line_width = options.get('lineWidth', 3)
    ax.plot(lons, lats, color=linecolor, linewidth=line_width, solid_capstyle='round')
    
    # Remove axes and set aspect
    ax.set_aspect('equal')
    ax.axis('off')
    
    # Add title if requested
    if options.get('showTitle', True):
        title = metadata.get('title', 'GPX Track')
        fig.suptitle(title, fontsize=16, y=0.98)
    
    # Add statistics if requested
    if options.get('showStats', True):
        stats_text = f"Distance: {metadata['distance']:.1f} km"
        if options.get('showElevation', True) and 'elevation' in metadata:
            stats_text += f" | Elevation: {metadata['elevation']} m"
        if 'duration' in metadata:
            stats_text += f" | Duration: {metadata['duration']}"
        if 'date' in metadata:
            stats_text += f" | Date: {metadata['date']}"
        
        fig.text(0.5, 0.02, stats_text, ha='center', fontsize=10)
    
    # Add padding around the track
    x_range = max(lons) - min(lons)
    y_range = max(lats) - min(lats)
    padding = 0.05  # 5% padding
    ax.set_xlim(min(lons) - x_range * padding, max(lons) + x_range * padding)
    ax.set_ylim(min(lats) - y_range * padding, max(lats) + y_range * padding)
    
    # Save the image to a temporary file
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp_img:
        image_path = temp_img.name
        fig.savefig(image_path, bbox_inches='tight', pad_inches=0.5, dpi=dpi)
    
    # Generate PDF with ReportLab
    pdf_path = image_path.replace('.png', '.pdf')
    
    # Create PDF with the same dimensions
    if options.get('orientation') == 'landscape':
        pdf_size = pdf_size[::-1]  # Swap width and height for landscape
    
    c = canvas.Canvas(pdf_path, pagesize=pdf_size)
    
    # Add the image to the PDF
    img = Image.open(image_path)
    # Calculate the scale to fit the image to the PDF page
    width, height = pdf_size
    img_width, img_height = img.size
    
    scale = min(width / img_width, height / img_height) * 0.9
    img_width *= scale
    img_height *= scale
    
    # Calculate position to center the image
    x = (width - img_width) / 2
    y = (height - img_height) / 2
    
    # Draw the image
    c.drawImage(image_path, x, y, width=img_width, height=img_height)
    
    # Add metadata to the PDF
    if options.get('showTitle', True):
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(width / 2, height - 50, metadata.get('title', 'GPX Track'))
    
    if options.get('showStats', True):
        c.setFont("Helvetica", 10)
        stats_text = f"Distance: {metadata['distance']:.1f} km"
        if options.get('showElevation', True) and 'elevation' in metadata:
            stats_text += f" | Elevation: {metadata['elevation']} m"
        if 'duration' in metadata:
            stats_text += f" | Duration: {metadata['duration']}"
        if 'date' in metadata:
            stats_text += f" | Date: {metadata['date']}"
        
        c.drawCentredString(width / 2, 40, stats_text)
    
    # Add a "Generated by Pretty GPX" footer
    c.setFont("Helvetica", 8)
    c.drawCentredString(width / 2, 20, "Generated by Pretty GPX")
    
    # Save the PDF
    c.save()
    
    return image_path, pdf_path

def extract_metadata(gpx_file):
    """
    Extract metadata from a GPX file
    """
    print(f"Extracting metadata from {gpx_file}")
    
    with open(gpx_file, 'r') as gpx_file_content:
        gpx = gpxpy.parse(gpx_file_content)
    
    # Initialize metadata
    metadata = {
        "title": os.path.basename(gpx_file).replace('.gpx', ''),
        "distance": 0,
        "elevation": 0,
        "duration": "0h 0m",
        "date": datetime.now().strftime("%Y-%m-%d"),
    }
    
    # Calculate total distance
    total_distance = 0
    min_elevation = float('inf')
    max_elevation = float('-inf')
    start_time = None
    end_time = None
    
    for track in gpx.tracks:
        for segment in track.segments:
            # Get track name if available
            if track.name and not metadata["title"]:
                metadata["title"] = track.name
                
            # Get start and end times if available
            if segment.points and segment.points[0].time:
                if start_time is None or segment.points[0].time < start_time:
                    start_time = segment.points[0].time
                    
            if segment.points and segment.points[-1].time:
                if end_time is None or segment.points[-1].time > end_time:
                    end_time = segment.points[-1].time
            
            # Calculate distance and find min/max elevation
            for i in range(len(segment.points) - 1):
                p1 = segment.points[i]
                p2 = segment.points[i + 1]
                
                # Add distance between consecutive points
                total_distance += p1.distance_2d(p2)
                
                # Track elevation
                if p1.elevation is not None:
                    min_elevation = min(min_elevation, p1.elevation)
                    max_elevation = max(max_elevation, p1.elevation)
            
            # Check the last point's elevation too
            if segment.points and segment.points[-1].elevation is not None:
                min_elevation = min(min_elevation, segment.points[-1].elevation)
                max_elevation = max(max_elevation, segment.points[-1].elevation)
    
    # Convert distance to kilometers
    metadata["distance"] = total_distance / 1000
    
    # Calculate elevation gain (if valid elevations were found)
    if min_elevation != float('inf') and max_elevation != float('-inf'):
        metadata["elevation"] = int(max_elevation - min_elevation)
    else:
        metadata["elevation"] = 0
    
    # Calculate duration if timestamps are available
    if start_time and end_time:
        duration = end_time - start_time
        hours, remainder = divmod(duration.total_seconds(), 3600)
        minutes, _ = divmod(remainder, 60)
        metadata["duration"] = f"{int(hours)}h {int(minutes)}m"
        
        # Use start date for the date field
        metadata["date"] = start_time.strftime("%Y-%m-%d")
    
    return metadata
