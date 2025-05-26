
#!/usr/bin/env python3
"""
Generate a poster from a GPX file using matplotlib and reportlab
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
import math

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance between two points on the earth (specified in decimal degrees)"""
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Radius of earth in kilometers
    r = 6371
    return c * r

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
    elevations = [p[2] for p in points if p[2] is not None]
    times = [p[3] for p in points if p[3] is not None]
    
    # Get metadata for the poster
    metadata = extract_metadata(gpx_file)
    
    # Override metadata with racer-specific information if provided
    racer_info = options.get('racerInfo', {})
    if racer_info:
        metadata['title'] = racer_info.get('raceName', metadata['title'])
        metadata['duration'] = racer_info.get('duration', metadata['duration'])
        metadata['racer_name'] = racer_info.get('name', '')
        metadata['ranking'] = racer_info.get('ranking', '')
    
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
    canvas_fig = FigureCanvas(fig)
    
    # Set the style based on template and color scheme
    template = options.get('template', 'standard')
    color_scheme = options.get('colorScheme', 'default')
    
    # Define color schemes
    color_schemes = {
        'default': {'bg': 'white', 'line': '#2196F3', 'text': '#333333'},
        'dark': {'bg': '#1a1a1a', 'line': '#ff6b6b', 'text': '#ffffff'},
        'green': {'bg': '#f0f8f0', 'line': '#228B22', 'text': '#2d5016'},
        'blue': {'bg': '#f0f8ff', 'line': '#0077cc', 'text': '#003d66'},
        'orange': {'bg': '#fff8f0', 'line': '#ff8c00', 'text': '#cc4400'}
    }
    
    colors_used = color_schemes.get(color_scheme, color_schemes['default'])
    
    # Create layout based on whether racer info should be shown
    show_racer_info = options.get('showRacerInfo', False) and racer_info
    
    if show_racer_info:
        # Create layout with space for racer information
        gs = fig.add_gridspec(4, 1, height_ratios=[0.3, 3, 1, 0.3])
        ax_header = fig.add_subplot(gs[0])
        ax = fig.add_subplot(gs[1])
        ax_stats = fig.add_subplot(gs[2])
        ax_footer = fig.add_subplot(gs[3])
        
        # Configure all subplots
        for subplot in [ax_header, ax, ax_stats, ax_footer]:
            subplot.set_facecolor(colors_used['bg'])
            subplot.axis('off')
    else:
        # Standard layout
        if template == 'detailed' and elevations:
            gs = fig.add_gridspec(3, 1, height_ratios=[3, 1, 0.2])
            ax = fig.add_subplot(gs[0])
            ax_elev = fig.add_subplot(gs[1])
            ax.set_facecolor(colors_used['bg'])
            ax_elev.set_facecolor(colors_used['bg'])
        else:
            ax = fig.add_subplot(111)
            ax.set_facecolor(colors_used['bg'])
    
    fig.patch.set_facecolor(colors_used['bg'])
    
    # Add topographic background for topographic template
    if template == 'topographic':
        create_topographic_background(ax, lons, lats)
    
    # Plot the track with the specified line width and color gradient
    line_width = options.get('lineWidth', 3)
    
    if template == 'detailed' and elevations:
        # Create elevation-based color gradient
        plot_elevation_gradient(ax, lons, lats, elevations, line_width)
    else:
        # Simple line plot
        ax.plot(lons, lats, color=colors_used['line'], linewidth=line_width, 
                solid_capstyle='round', alpha=0.8)
    
    # Add start and end markers
    if len(points) > 1:
        ax.plot(lons[0], lats[0], 'o', color='green', markersize=8, label='Start')
        ax.plot(lons[-1], lats[-1], 's', color='red', markersize=8, label='End')
    
    # Remove axes and set aspect
    ax.set_aspect('equal')
    ax.axis('off')
    
    # Add padding around the track
    x_range = max(lons) - min(lons)
    y_range = max(lats) - min(lats)
    padding = 0.1  # 10% padding
    ax.set_xlim(min(lons) - x_range * padding, max(lons) + x_range * padding)
    ax.set_ylim(min(lats) - y_range * padding, max(lats) + y_range * padding)
    
    # Add racer-specific header information
    if show_racer_info and 'ax_header' in locals():
        ax_header.text(0.5, 0.7, metadata.get('racer_name', ''), 
                      ha='center', va='center', fontsize=20, weight='bold',
                      color=colors_used['text'], transform=ax_header.transAxes)
        ax_header.text(0.5, 0.3, f"Ranking: #{metadata.get('ranking', 'N/A')}", 
                      ha='center', va='center', fontsize=14,
                      color=colors_used['text'], transform=ax_header.transAxes)
    elif options.get('showTitle', True):
        # Standard title
        title = metadata.get('title', 'GPX Track')
        fig.suptitle(title, fontsize=18, y=0.95, color=colors_used['text'], weight='bold')
    
    # Add comprehensive statistics
    if show_racer_info and 'ax_stats' in locals():
        # Create detailed stats layout for race info
        stats_lines = [
            f"Race: {metadata.get('title', 'N/A')}",
            f"Duration: {metadata.get('duration', 'N/A')}",
            f"Distance: {metadata.get('distance', 0):.1f} km",
        ]
        
        if options.get('showElevation', True) and 'elevation' in metadata:
            stats_lines.append(f"Elevation Gain: {metadata['elevation']} m")
        
        if 'date' in metadata:
            stats_lines.append(f"Date: {metadata['date']}")
        
        # Display stats in a grid
        for i, line in enumerate(stats_lines):
            y_pos = 0.8 - (i * 0.15)
            ax_stats.text(0.1, y_pos, line, ha='left', va='center', 
                         fontsize=12, color=colors_used['text'], 
                         weight='bold', transform=ax_stats.transAxes)
    elif options.get('showStats', True):
        # Standard stats at bottom
        stats_text = f"Distance: {metadata['distance']:.1f} km"
        if options.get('showElevation', True) and 'elevation' in metadata:
            stats_text += f" • Elevation: {metadata['elevation']} m"
        if 'duration' in metadata:
            stats_text += f" • Duration: {metadata['duration']}"
        if 'date' in metadata:
            stats_text += f" • Date: {metadata['date']}"
        
        fig.text(0.5, 0.05, stats_text, ha='center', fontsize=12, 
                color=colors_used['text'], weight='bold')
    
    # Add elevation profile for detailed template
    if template == 'detailed' and elevations and 'ax_elev' in locals():
        distances = calculate_cumulative_distances(lons, lats)
        ax_elev.plot(distances, elevations, color=colors_used['line'], linewidth=2)
        ax_elev.fill_between(distances, elevations, alpha=0.3, color=colors_used['line'])
        ax_elev.set_xlabel('Distance (km)', color=colors_used['text'])
        ax_elev.set_ylabel('Elevation (m)', color=colors_used['text'])
        ax_elev.grid(True, alpha=0.3)
        ax_elev.tick_params(colors=colors_used['text'])
    
    # Add footer with generation info
    if show_racer_info and 'ax_footer' in locals():
        ax_footer.text(0.5, 0.5, "Generated by Pretty GPX", 
                      ha='center', va='center', fontsize=8, 
                      color=colors_used['text'], alpha=0.7,
                      transform=ax_footer.transAxes)
    
    # Save the image to a temporary file
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp_img:
        image_path = temp_img.name
        fig.savefig(image_path, bbox_inches='tight', pad_inches=0.5, dpi=dpi, 
                   facecolor=colors_used['bg'])
    
    # Generate PDF with ReportLab
    pdf_path = image_path.replace('.png', '.pdf')
    create_pdf_poster(pdf_path, image_path, metadata, options, pdf_size, colors_used)
    
    return image_path, pdf_path

# ... keep existing code (create_topographic_background, plot_elevation_gradient, calculate_cumulative_distances, create_pdf_poster, extract_metadata functions remain the same)

def create_topographic_background(ax, lons, lats):
    """Create a topographic-style background"""
    x_min, x_max = min(lons), max(lons)
    y_min, y_max = min(lats), max(lats)
    
    # Create a grid for contour lines
    x = np.linspace(x_min, x_max, 20)
    y = np.linspace(y_min, y_max, 20)
    X, Y = np.meshgrid(x, y)
    
    # Create some artificial elevation data for contours
    Z = np.sin(X * 50) * np.cos(Y * 50) + np.random.random(X.shape) * 0.1
    
    # Add subtle contour lines
    ax.contour(X, Y, Z, levels=10, colors='gray', alpha=0.2, linewidths=0.5)

def plot_elevation_gradient(ax, lons, lats, elevations, line_width):
    """Plot track with elevation-based color gradient"""
    points = np.array([lons, lats]).T.reshape(-1, 1, 2)
    segments = np.concatenate([points[:-1], points[1:]], axis=1)
    
    from matplotlib.collections import LineCollection
    
    # Normalize elevations for color mapping
    norm = plt.Normalize(min(elevations), max(elevations))
    lc = LineCollection(segments, cmap='terrain', norm=norm, linewidths=line_width)
    lc.set_array(np.array(elevations[:-1]))
    ax.add_collection(lc)

def calculate_cumulative_distances(lons, lats):
    """Calculate cumulative distances along the track"""
    distances = [0]
    total_distance = 0
    
    for i in range(1, len(lons)):
        dist = haversine_distance(lats[i-1], lons[i-1], lats[i], lons[i])
        total_distance += dist
        distances.append(total_distance)
    
    return distances

def create_pdf_poster(pdf_path, image_path, metadata, options, pdf_size, colors_used):
    """Create a PDF version of the poster"""
    # Create PDF with the same dimensions
    if options.get('orientation') == 'landscape':
        pdf_size = pdf_size[::-1]  # Swap width and height for landscape
    
    c = canvas.Canvas(pdf_path, pagesize=pdf_size)
    
    # Add the image to the PDF
    img = Image.open(image_path)
    width, height = pdf_size
    img_width, img_height = img.size
    
    # Calculate the scale to fit the image to the PDF page
    scale = min(width / img_width, height / img_height) * 0.9
    img_width *= scale
    img_height *= scale
    
    # Calculate position to center the image
    x = (width - img_width) / 2
    y = (height - img_height) / 2
    
    # Draw the image
    c.drawImage(image_path, x, y, width=img_width, height=img_height)
    
    # Add a subtle border
    c.setStrokeColor(colors.grey)
    c.setLineWidth(1)
    c.rect(x-5, y-5, img_width+10, img_height+10)
    
    # Add "Generated by Pretty GPX" footer
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.grey)
    c.drawCentredString(width / 2, 15, "Generated by Pretty GPX")
    
    # Save the PDF
    c.save()

def extract_metadata(gpx_file):
    """
    Extract comprehensive metadata from a GPX file
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
    
    # Calculate total distance and elevation
    total_distance = 0
    min_elevation = float('inf')
    max_elevation = float('-inf')
    start_time = None
    end_time = None
    
    for track in gpx.tracks:
        # Get track name if available
        if track.name:
            metadata["title"] = track.name
            
        for segment in track.segments:
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
                
                # Calculate distance using haversine formula
                if p1.latitude and p1.longitude and p2.latitude and p2.longitude:
                    dist = haversine_distance(p1.latitude, p1.longitude, 
                                            p2.latitude, p2.longitude)
                    total_distance += dist
                
                # Track elevation
                if p1.elevation is not None:
                    min_elevation = min(min_elevation, p1.elevation)
                    max_elevation = max(max_elevation, p1.elevation)
            
            # Check the last point's elevation too
            if segment.points and segment.points[-1].elevation is not None:
                min_elevation = min(min_elevation, segment.points[-1].elevation)
                max_elevation = max(max_elevation, segment.points[-1].elevation)
    
    # Set calculated values
    metadata["distance"] = total_distance
    
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
