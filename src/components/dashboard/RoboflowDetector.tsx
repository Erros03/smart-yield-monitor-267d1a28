import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, ScanSearch, Upload, Loader2, Radio, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useServerFn } from "@tanstack/react-start";
import { detectTomatoesFn } from "@/lib/roboflow.functions";
import type { RoboflowDetectionResult } from "@/lib/roboflow.server";

const CLASS_COLORS: Record<string, string> = {
  ripe_tomato: "#ef4444",
  unripe_tomato: "#22c55e",
  blighted_tomato: "#a855f7",
};

function colorForClass(name: string) {
  return CLASS_COLORS[name] ?? "#f59e0b";
}

function prettify(name: string) {
  return name.replace(/_/g, " ");
}

type PermissionState = "idle" | "prompting" | "granted" | "denied" | "notfound" | "error";

export function RoboflowDetector() {
  const detect = useServerFn(detectTomatoesFn);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(false);
  const runningRef = useRef(false);

  const [permission, setPermission] = useState<PermissionState>("idle");
  const [cameraOn, setCameraOn] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoboflowDetectionResult | null>(null);
  const [still, setStill] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  const drawResult = useCallback(
    (detections: RoboflowDetectionResult, source: HTMLVideoElement | HTMLImageElement) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
      const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
      if (!srcW || !srcH) return;

      canvas.width = srcW;
      canvas.height = srcH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(source, 0, 0, srcW, srcH);
      const sx = srcW / detections.imageWidth;
      const sy = srcH / detections.imageHeight;

      for (const p of detections.predictions) {
        const x = (p.x - p.width / 2) * sx;
        const y = (p.y - p.height / 2) * sy;
        const w = p.width * sx;
        const h = p.height * sy;
        const color = colorForClass(p.className);

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(3, srcW / 300);
        ctx.strokeRect(x, y, w, h);

        const label = `${prettify(p.className)} ${(p.confidence * 100).toFixed(0)}%`;
        ctx.font = `${Math.max(14, srcW / 50)}px sans-serif`;
        const textW = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.fillRect(x, Math.max(0, y - 26), textW + 12, 26);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, x + 6, Math.max(18, y - 7));
      }
    },
    [],
  );

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    startedRef.current = false;
    setCameraOn(false);
    setFps(0);
  }, []);

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const capture = document.createElement("canvas");
    capture.width = video.videoWidth;
    capture.height = video.videoHeight;
    capture.getContext("2d")?.drawImage(video, 0, 0);
    return { video, base64: capture.toDataURL("image/jpeg", 0.7).split(",")[1] ?? "" };
  };

  // Continuous loop: analyze newest frame as soon as previous inference resolves.
  const runLoop = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    let failures = 0;

    while (runningRef.current) {
      const frame = captureFrame();
      if (frame) {
        const started = performance.now();
        try {
          const detections = await detect({ data: { imageBase64: frame.base64 } });
          if (!runningRef.current) break;
          setResult(detections);
          drawResult(detections, frame.video);
          setError(null);
          failures = 0;
          setFps(Number((1000 / Math.max(1, performance.now() - started)).toFixed(1)));
        } catch (err) {
          failures += 1;
          if (failures >= 3) {
            setError(err instanceof Error ? err.message : "Detection failed. Retrying stopped.");
            runningRef.current = false;
            break;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }, [detect, drawResult]);

  const startCamera = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setError(null);
    setPermission("prompting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280 },
      });
      streamRef.current = media;
      setPermission("granted");
      setCameraOn(true);
      setStill(null);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
      void runLoop();
    } catch (err) {
      startedRef.current = false;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        setPermission("denied");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setPermission("notfound");
      } else {
        setPermission("error");
        setError(err instanceof Error ? err.message : "Could not start the camera.");
      }
    }
  }, [runLoop]);

  // Auto-initialize the camera once when the page mounts, and clean up on exit.
  useEffect(() => {
    void startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.split(",")[1] ?? "";
      const img = new Image();
      img.onload = async () => {
        stopCamera();
        setStill(dataUrl);
        setAnalyzing(true);
        try {
          const detections = await detect({ data: { imageBase64: base64 } });
          setResult(detections);
          drawResult(detections, img);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Detection failed.");
        } finally {
          setAnalyzing(false);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const counts = result
    ? result.predictions.reduce<Record<string, number>>((acc, p) => {
        acc[p.className] = (acc[p.className] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {cameraOn ? (
          <>
            <Button size="sm" variant="outline" onClick={stopCamera}>
              <CameraOff className="mr-2 h-4 w-4" />
              Stop camera
            </Button>
            <Badge className="gap-1.5 bg-danger/10 text-danger" variant="outline">
              <Radio className="h-3 w-3 animate-pulse" />
              Live detection · {fps} fps
            </Badge>
          </>
        ) : (
          <Button size="sm" onClick={startCamera}>
            <Camera className="mr-2 h-4 w-4" />
            Start camera
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={analyzing}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload image
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        <Badge variant="outline" className="ml-auto text-xs font-medium">
          Model: tomato-fruit-ripeness-and-blight v1
        </Badge>
      </div>

      {permission === "prompting" && (
        <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Camera access is required. Please click <strong>Allow</strong> when your browser asks for
          camera permission.
        </div>
      )}

      {permission === "denied" && (
        <div className="space-y-1 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          <p className="font-medium">Camera access is blocked.</p>
          <p>
            Click the camera or lock icon in your browser&apos;s address bar, set Camera to
            &quot;Allow&quot; for this site, then reload the page. On Chrome you can also go to
            Settings → Privacy and security → Site settings → Camera.
          </p>
        </div>
      )}

      {permission === "notfound" && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          No camera device was found. Connect a webcam and reload, or upload an image instead.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="relative aspect-video overflow-hidden rounded-lg bg-foreground">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cameraOn && !still ? "h-full w-full object-contain" : "hidden"}
        />
        <canvas
          ref={canvasRef}
          className={result ? "absolute inset-0 h-full w-full object-contain" : "hidden"}
        />
        {!cameraOn && !result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-background/80">
            <ScanSearch className="h-10 w-10 opacity-60" />
            <p className="text-sm font-medium">
              Waiting for camera access to start real-time detection
            </p>
            <p className="text-xs text-background/50">
              Detects ripe, unripe, and blighted tomatoes using your trained model
            </p>
          </div>
        )}
        {analyzing && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/40">
            <Loader2 className="h-8 w-8 animate-spin text-background" />
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {result.predictions.length} detection
            {result.predictions.length === 1 ? "" : "s"} · inference in {result.inferenceTimeMs} ms
          </p>
          {result.predictions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tomatoes in the current frame.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(counts).map(([cls, n]) => (
                <Badge
                  key={cls}
                  variant="outline"
                  className="text-xs font-medium"
                  style={{ borderColor: colorForClass(cls), color: colorForClass(cls) }}
                >
                  {prettify(cls)} · {n}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
