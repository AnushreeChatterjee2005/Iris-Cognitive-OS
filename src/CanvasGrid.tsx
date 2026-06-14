import { useEffect, useRef } from 'react';

export function CanvasGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const speed = 0.28;
    const borderColor = 'rgba(74, 134, 232, 0.05)';
    const hoverFillColor = 'rgba(74, 134, 232, 0.08)';
    const squareSize = 46;
    const hoverTrailAmount = 4;

    const gridOffset = { x: 0, y: 0 };
    const hoveredSquare = { current: null as {x: number, y: number} | null };
    const trailCells: {x: number, y: number}[] = [];
    const cellOpacities = new Map<string, number>();
    let requestId: number;
    let numSquaresX = 0;
    let numSquaresY = 0;

    const resizeCanvas = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.offsetWidth * ratio);
      canvas.height = Math.floor(canvas.offsetHeight * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      numSquaresX = Math.ceil(canvas.offsetWidth / squareSize) + 3;
      numSquaresY = Math.ceil(canvas.offsetHeight / squareSize) + 3;
    };

    const updateCellOpacities = () => {
      const targets = new Map<string, number>();

      if (hoveredSquare.current) {
        targets.set(`${hoveredSquare.current.x},${hoveredSquare.current.y}`, 1);
      }

      if (hoverTrailAmount > 0) {
        for (let i = 0; i < trailCells.length; i++) {
          const cell = trailCells[i];
          const key = `${cell.x},${cell.y}`;
          if (!targets.has(key)) {
            targets.set(key, (trailCells.length - i) / (trailCells.length + 1));
          }
        }
      }

      for (const [key] of targets) {
        if (!cellOpacities.has(key)) cellOpacities.set(key, 0);
      }

      for (const [key, opacity] of cellOpacities) {
        const target = targets.get(key) || 0;
        const next = opacity + (target - opacity) * 0.15;
        if (next < 0.005) {
          cellOpacities.delete(key);
        } else {
          cellOpacities.set(key, next);
        }
      }
    };

    const drawGrid = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      const offsetX = ((gridOffset.x % squareSize) + squareSize) % squareSize;
      const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;

      for (let col = -2; col < numSquaresX; col++) {
        for (let row = -2; row < numSquaresY; row++) {
          const sx = col * squareSize + offsetX;
          const sy = row * squareSize + offsetY;
          const cellKey = `${col},${row}`;
          const alpha = cellOpacities.get(cellKey);

          if (alpha) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = hoverFillColor;
            ctx.fillRect(sx, sy, squareSize, squareSize);
            ctx.globalAlpha = 1;
          }

          ctx.strokeStyle = borderColor;
          ctx.strokeRect(sx, sy, squareSize, squareSize);
        }
      }

      const glow = ctx.createRadialGradient(width * 0.28, height * 0.1, 0, width * 0.28, height * 0.1, Math.max(width, height) * 0.75);
      glow.addColorStop(0, 'rgba(255, 170, 0, 0.02)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      const vignette = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.sqrt(width ** 2 + height ** 2) / 2);
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
      vignette.addColorStop(0.68, 'rgba(0, 0, 0, 0.55)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    const updateAnimation = () => {
      const effectiveSpeed = Math.max(speed, 0.1);
      gridOffset.x = (gridOffset.x - effectiveSpeed + squareSize) % squareSize;
      gridOffset.y = (gridOffset.y - effectiveSpeed + squareSize) % squareSize;
      
      updateCellOpacities();
      drawGrid();
      requestId = requestAnimationFrame(updateAnimation);
    };

    const setHoveredCell = (cell: {x: number, y: number}) => {
      if (
        !hoveredSquare.current ||
        hoveredSquare.current.x !== cell.x ||
        hoveredSquare.current.y !== cell.y
      ) {
        if (hoveredSquare.current && hoverTrailAmount > 0) {
          trailCells.unshift({ ...hoveredSquare.current });
          if (trailCells.length > hoverTrailAmount) trailCells.length = hoverTrailAmount;
        }
        hoveredSquare.current = cell;
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const offsetX = ((gridOffset.x % squareSize) + squareSize) % squareSize;
      const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;

      setHoveredCell({
        x: Math.floor((mouseX - offsetX) / squareSize),
        y: Math.floor((mouseY - offsetY) / squareSize)
      });
    };

    const handleMouseLeave = () => {
      if (hoveredSquare.current && hoverTrailAmount > 0) {
        trailCells.unshift({ ...hoveredSquare.current });
        if (trailCells.length > hoverTrailAmount) trailCells.length = hoverTrailAmount;
      }
      hoveredSquare.current = null;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    requestId = requestAnimationFrame(updateAnimation);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(requestId);
    };
  }, []);

  return <canvas ref={canvasRef} className="shapegrid-canvas" aria-hidden="true" />;
}
