
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PosterOptions as PosterOptionsType } from "@/types";

interface PosterOptionsProps {
  options: PosterOptionsType;
  onOptionsChange: (options: PosterOptionsType) => void;
}

const PosterOptions = ({ options, onOptionsChange }: PosterOptionsProps) => {
  const handleChange = (key: keyof PosterOptionsType, value: any) => {
    onOptionsChange({ ...options, [key]: value });
  };

  return (
    <Card>
      <CardContent className="p-6">
        <Tabs defaultValue="style" className="w-full">
          <TabsList className="grid grid-cols-3 mb-6">
            <TabsTrigger value="style">Style</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          
          <TabsContent value="style" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template">Poster Template</Label>
              <Select 
                value={options.template} 
                onValueChange={(value) => handleChange("template", value)}
              >
                <SelectTrigger id="template">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal">Minimal</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                  <SelectItem value="topographic">Topographic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="colorScheme">Color Scheme</Label>
              <Select 
                value={options.colorScheme} 
                onValueChange={(value) => handleChange("colorScheme", value)}
              >
                <SelectTrigger id="colorScheme">
                  <SelectValue placeholder="Select color scheme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="terrain">Terrain</SelectItem>
                  <SelectItem value="elevation">Elevation</SelectItem>
                  <SelectItem value="speed">Speed</SelectItem>
                  <SelectItem value="monochrome">Monochrome</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lineWidth">Line Width</Label>
              <Slider 
                id="lineWidth" 
                min={1} 
                max={10} 
                step={0.5} 
                value={[options.lineWidth]} 
                onValueChange={(value) => handleChange("lineWidth", value[0])}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="details" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="showTitle">Show Title</Label>
              <Switch 
                id="showTitle" 
                checked={options.showTitle} 
                onCheckedChange={(checked) => handleChange("showTitle", checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="showStats">Show Statistics</Label>
              <Switch 
                id="showStats" 
                checked={options.showStats} 
                onCheckedChange={(checked) => handleChange("showStats", checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="showElevation">Show Elevation Profile</Label>
              <Switch 
                id="showElevation" 
                checked={options.showElevation} 
                onCheckedChange={(checked) => handleChange("showElevation", checked)}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="advanced" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="paperSize">Paper Size</Label>
              <Select 
                value={options.paperSize} 
                onValueChange={(value) => handleChange("paperSize", value)}
              >
                <SelectTrigger id="paperSize">
                  <SelectValue placeholder="Select paper size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4</SelectItem>
                  <SelectItem value="a3">A3</SelectItem>
                  <SelectItem value="letter">Letter</SelectItem>
                  <SelectItem value="legal">Legal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="orientation">Orientation</Label>
              <Select 
                value={options.orientation} 
                onValueChange={(value) => handleChange("orientation", value)}
              >
                <SelectTrigger id="orientation">
                  <SelectValue placeholder="Select orientation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="highResolution">High Resolution</Label>
              <Switch 
                id="highResolution" 
                checked={options.highResolution} 
                onCheckedChange={(checked) => handleChange("highResolution", checked)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default PosterOptions;
