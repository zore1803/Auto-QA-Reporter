import { useState } from "react";
import { Maximize2, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ScreenshotListScreenshotsItem } from "@workspace/api-client-react";

interface ScreenshotGalleryProps {
  screenshots?: ScreenshotListScreenshotsItem[];
}

export function ScreenshotGallery({ screenshots = [] }: ScreenshotGalleryProps) {
  const [selectedImg, setSelectedImg] = useState<ScreenshotListScreenshotsItem | null>(null);

  if (!screenshots.length) {
    return (
      <div className="p-12 text-center border rounded-md mt-4 bg-muted/30">
        <p className="text-muted-foreground text-sm">No screenshots captured.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {screenshots.map((img, idx) => (
          <Card 
            key={idx} 
            className="group relative overflow-hidden cursor-pointer hover:border-primary transition-colors"
            onClick={() => setSelectedImg(img)}
          >
            <div className="aspect-[4/3] bg-muted relative">
              <img 
                src={img.url} 
                alt={`Screenshot of ${img.pageUrl}`} 
                className="w-full h-full object-cover object-top opacity-90 group-hover:opacity-100 transition-opacity"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-background/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                <Maximize2 className="w-8 h-8 text-foreground" />
              </div>
            </div>
            <div className="p-3 border-t bg-card text-xs truncate font-mono text-muted-foreground">
              {img.pageUrl}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedImg} onOpenChange={(open) => !open && setSelectedImg(null)}>
        <DialogContent className="max-w-6xl w-[95vw] p-0 overflow-hidden sm:rounded-lg">
          <DialogHeader className="p-4 border-b bg-card">
            <DialogTitle className="text-base font-medium">Screenshot</DialogTitle>
            <DialogDescription className="text-xs truncate font-mono">{selectedImg?.pageUrl}</DialogDescription>
          </DialogHeader>
          <div className="relative w-full max-h-[75vh] min-h-[50vh] overflow-y-auto overflow-x-hidden bg-muted/30 p-2 sm:p-4">
            {selectedImg && (
              <img 
                src={selectedImg.url} 
                alt="Full size screenshot" 
                className="w-full h-auto rounded shadow-sm border mx-auto"
              />
            )}
          </div>
          <div className="p-4 border-t bg-card flex justify-end">
            <Button 
              variant="secondary" 
              onClick={() => window.open(selectedImg?.pageUrl, "_blank")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Page
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}