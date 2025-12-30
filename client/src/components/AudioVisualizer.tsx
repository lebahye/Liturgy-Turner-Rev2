import { useRef, useEffect } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  height?: number;
  width?: number;
}

export function AudioVisualizer({ analyser, isActive, height = 100, width = 800 }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number;
    
    // Clear initial
    ctx.fillStyle = 'rgb(240, 240, 240)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!isActive || !analyser) {
      return;
    }
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const draw = () => {
      animationId = requestAnimationFrame(draw);
      
      analyser.getByteTimeDomainData(dataArray);
      
      ctx.fillStyle = 'rgb(240, 240, 240)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgb(74, 144, 226)'; // Primary blue color
      ctx.beginPath();
      
      const sliceWidth = canvas.width / dataArray.length;
      let x = 0;
      
      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        
        x += sliceWidth;
      }
      
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    
    draw();
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser, isActive]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className="w-full rounded-md border border-gray-200 bg-gray-50"
    />
  );
}
