const canvas = document.getElementById('ballCanvas');
const ctx = canvas.getContext('2d');

// Set canvas to full window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Ball state
let x = canvas.width / 2;
let y = canvas.height / 2;
let vx = 4;
let vy = 3;
const radius = 20;

function animate() {
  // 1. Clear previous frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. Draw the ball
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ff4757';
  ctx.fill();

  // 3. Move the ball
  x += vx;
  y += vy;

  // 4. Bounce off left/right walls
  if (x + radius >= canvas.width || x - radius <= 0) {
    vx = -vx;
  }

  // 5. Bounce off top/bottom walls
  if (y + radius >= canvas.height || y - radius <= 0) {
    vy = -vy;
  }

  // 6. Request next animation frame
  requestAnimationFrame(animate);
}

// Keep canvas full screen on window resize
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// Start the animation loop
animate();
