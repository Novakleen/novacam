export const drawLine = (ctx, fromX, fromY, toX, toY, color, width) => {
  if (!ctx) return;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};

export const clearCanvas = (ctx, canvasWidth, canvasHeight) => {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
};

export const saveCanvasState = (canvas) => {
  if (!canvas) return null;
  return canvas.toDataURL();
};

export const restoreCanvasState = (ctx, dataUrl, canvasWidth, canvasHeight) => {
  if (!ctx || !dataUrl) return;
  const img = new Image();
  img.src = dataUrl;
  img.onload = () => {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
  };
};

export const getCoordinates = (event, canvas) => {
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  let clientX, clientY;
  
  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
};