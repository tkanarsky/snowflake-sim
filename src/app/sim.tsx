import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../components/ui/card';
import { Slider, Button, Checkbox } from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';

// Constants and Types
interface SnowflakeState {
  position: [number, number];
  velocity: [number, number];
  theta: number;
  omega: number;
  mass: number;
  diameter: number;
}

interface SimParams {
  g: number;
  airPressure: number;
  numFlakes: number;
  massMean: number;
  massVar: number;
  diameterMean: number;
  diameterVar: number;
  thetaMean: number;
  thetaVar: number;
}

// Utility Functions
const normalizeAngle = (angle: number): number => {
  // Normalize angle to [0, 2π]
  angle = angle % (2 * Math.PI);
  if (angle < 0) {
    angle += 2 * Math.PI;
  }
  return angle;
};

const normalRandom = (mean: number, variance: number) => {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  const std = Math.sqrt(variance);
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

const createSnowflake = (params: SimParams): SnowflakeState => ({
  position: [Math.random() * 3.0, 9.0],  // Random x position from 0 to 3 meters, fixed y at 9 meters
  velocity: [0, 0],
  theta: normalizeAngle(normalRandom(params.thetaMean * Math.PI / 180, params.thetaVar * Math.PI / 180)),
  omega: 0,
  mass: normalRandom(params.massMean, params.massVar) / 1e6, // Convert mg to kg
  diameter: normalRandom(params.diameterMean, params.diameterVar) / 1000, // Convert mm to m
});

// Physics update function from previous discussion
function updateSnowflake(
  state: SnowflakeState,
  dt: number,
  params: SimParams
): SnowflakeState {
  const { g, airPressure } = params;
  const rho = 1.225 * (airPressure / 1.0);
  
  const nx = Math.cos(state.theta);
  const ny = Math.sin(state.theta);
  
  const vmag = Math.hypot(state.velocity[0], state.velocity[1]);
  
  // Handle zero velocity case properly
  let vx = 0, vy = -1, aoa = state.theta;  // Default to falling straight down
  if (vmag > 1e-6) {
    vx = state.velocity[0] / vmag;
    vy = state.velocity[1] / vmag;
    aoa = Math.acos(Math.max(-1, Math.min(1, vx * nx + vy * ny))); // Clamp to avoid numerical errors
  }
  
  // Projected area now considers both angle of attack and diameter
  const minArea = 0.7 * state.diameter * state.diameter; // Minimum area when edge-on
  const maxArea = state.diameter * state.diameter; // Maximum area when face-on
  const A = minArea + ((maxArea - minArea) * Math.sin(aoa));
  
  // Modified drag and lift coefficients
  const Cd = 1.28;  // Constant drag coefficient
  const Cl = 0.5 * Math.sin(2 * aoa);  // Reduced lift coefficient
  
  // Calculate forces with dampening at high speeds
//   const speedFactor = Math.min(1.0, 10.0 / (vmag + 1.0));  // Dampen forces at high speeds
  const Fdrag = 0.5 * rho * Cd * A * vmag * vmag * 1;
  const Flift = 0.5 * rho * Cl * A * vmag * vmag * 1;
  
  // Apply forces - note that drag acts against velocity direction
  const ax = vmag > 1e-6 ? (-Fdrag * vx + Flift * nx) / state.mass : 0;
  const ay = vmag > 1e-6 ? (-Fdrag * vy + Flift * ny) / state.mass - g : -g;
  
  // Reduced torque coefficient
  const torque = -0.0005 * state.diameter * Flift;  // Reduced torque
  const I = (1/12) * state.mass * state.diameter * state.diameter;
  const alpha = torque / I;
  
  const new_omega = state.omega + alpha * dt;
  const new_theta = normalizeAngle(state.theta + new_omega * dt);
  const new_vx = state.velocity[0] + ax * dt;
  const new_vy = state.velocity[1] + ay * dt;
  const new_x = state.position[0] + new_vx * dt;
  const new_y = state.position[1] + new_vy * dt;
  
  return {
    position: [new_x, new_y],
    velocity: [new_vx, new_vy],
    theta: new_theta,
    omega: new_omega,
    mass: state.mass,
    diameter: state.diameter
  };
}

// DistSlider Component
const DistSlider = ({ 
  label, 
  min, 
  max, 
  meanValue, 
  varValue, 
  onMeanChange, 
  onVarChange 
}) => (
  <div className="mb-4">
    <label className="block text-sm font-medium mb-1">{label}</label>
    <div className="space-y-2">
      <div>
        <span className="text-xs">Mean: {meanValue.toFixed(2)}</span>
        <Slider
          min={min}
          max={max}
          stepSize={(max - min) / 100}
          labelStepSize={(max - min) / 4}
          value={meanValue}
          onChange={onMeanChange}
          className="w-full"
        />
      </div>
      <div>
        <span className="text-xs">Variance: {varValue.toFixed(2)}</span>
        <Slider
          min={0}
          max={(max - min) / 5}
          stepSize={(max - min) / 500}
          labelStepSize={(max - min) / 20}
          value={varValue}
          onChange={onVarChange}
          className="w-full"
        />
      </div>
    </div>
  </div>
);

// Main Component
const SnowflakeSimulation = () => {
  // Simulation parameters
  const [params, setParams] = useState<SimParams>({
    g: 9.81,
    airPressure: 1.0,
    numFlakes: 1000,
    massMean: 1.0,
    massVar: 0.15,
    diameterMean: 6.0,
    diameterVar: 1.0,
    thetaMean: 47,
    thetaVar: 100
  });

  // UI state
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEngineering, setShowEngineering] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);
  const snowflakesRef = useRef<SnowflakeState[]>([]);
  const trailHistoryRef = useRef<Array<Array<[number, number]>>>([]);

  // Initialize snowflakes
  const resetSnowflakes = () => {
    snowflakesRef.current = Array(params.numFlakes)
      .fill(null)
      .map(() => createSnowflake(params));
    trailHistoryRef.current = Array(params.numFlakes)
      .fill(null)
      .map(() => []);
  };

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.width = 600;  // 3m * 200px/m
    canvas.height = 2000; // 10m * 200px/m
    
    resetSnowflakes();
  }, [params.numFlakes]);

  // Animation loop
  const animate = (timestamp: number) => {
    if (!canvasRef.current) return;
    
    const dt = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    // Physics substeps
    const numSubsteps = 4;
    const subDt = dt / numSubsteps;

    // Update physics
    for (let step = 0; step < numSubsteps; step++) {
      snowflakesRef.current = snowflakesRef.current.map((flake, index) => {
        const updated = updateSnowflake(flake, subDt, params);
        
        // Store trail history
        if (showTrail) {
          if (!trailHistoryRef.current[index]) {
            trailHistoryRef.current[index] = [];
          }
          trailHistoryRef.current[index].push([updated.position[0], updated.position[1]]);
          // Keep only last 50 positions
        }
        
        // Reset if below ground
        if (updated.position[1] < 1.0) {
          trailHistoryRef.current[index] = [];
          return createSnowflake(params);
        }
        
        return updated;
      });
    }

    // Render
    const ctx = canvasRef.current.getContext('2d')!;
    const scale = 200; // pixels per meter
    
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw ground
    ctx.fillStyle = '#333';
    ctx.fillRect(0, ctx.canvas.height - scale, ctx.canvas.width, scale);

    // Draw trails first
    if (showTrail) {
      ctx.strokeStyle = 'rgb(255, 255, 255)';
      ctx.lineWidth = 2;
      
      trailHistoryRef.current.forEach(trail => {
        if (!trail || trail.length < 2) return;
        
        ctx.beginPath();
        const [firstX, firstY] = trail[0];
        ctx.moveTo(firstX * scale, ctx.canvas.height - firstY * scale);
        
        for (let i = 1; i < trail.length; i++) {
          const [x, y] = trail[i];
          ctx.lineTo(x * scale, ctx.canvas.height - y * scale);
        }
        ctx.stroke();
      });
    }

    snowflakesRef.current.forEach((flake, index) => {
      const [x, y] = flake.position;
      const screenX = x * scale;
      const screenY = ctx.canvas.height - y * scale;

      if (showEngineering) {
        // Draw orientation line
        const nx = Math.cos(flake.theta);
        const ny = Math.sin(flake.theta);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(
          screenX - nx * 10,
          screenY + ny * 10
        );
        ctx.lineTo(
          screenX + nx * 10,
          screenY - ny * 10
        );
        ctx.stroke();

        // Draw normal indicator
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(
          screenX + nx * 10,
          screenY - ny * 10,
          3,
          0,
          2 * Math.PI
        );
        ctx.fill();
      } else {
        // Draw simple snowflake
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 2.5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  };

  // Handle play/pause
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animate);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  return (
    <div className="flex gap-4 p-4">
      {/* Controls */}
      <Card className="p-4 w-64 space-y-4">
        <DistSlider
          label="Mass (mg)"
          min={0.1}
          max={10}
          meanValue={params.massMean}
          varValue={params.massVar}
          onMeanChange={(v) => setParams(p => ({ ...p, massMean: v }))}
          onVarChange={(v) => setParams(p => ({ ...p, massVar: v }))}
        />
        
        <DistSlider
          label="Diameter (mm)"
          min={1}
          max={10}
          meanValue={params.diameterMean}
          varValue={params.diameterVar}
          onMeanChange={(v) => setParams(p => ({ ...p, diameterMean: v }))}
          onVarChange={(v) => setParams(p => ({ ...p, diameterVar: v }))}
        />
        
        <DistSlider
          label="Initial Angle (degrees)"
          min={0}
          max={360}
          meanValue={params.thetaMean}
          varValue={params.thetaVar}
          onMeanChange={(v) => setParams(p => ({ ...p, thetaMean: v }))}
          onVarChange={(v) => setParams(p => ({ ...p, thetaVar: v }))}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Gravity (m/s²): {params.g.toFixed(1)}
          </label>
          <Slider
            min={0}
            max={10}
            stepSize={0.1}
            labelStepSize={2}
            value={params.g}
            onChange={(v) => setParams(p => ({ ...p, g: v }))}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Air Pressure (atm): {params.airPressure.toFixed(2)}
          </label>
          <Slider
            min={0}
            max={1}
            stepSize={0.01}
            labelStepSize={0.2}
            value={params.airPressure}
            onChange={(v) => setParams(p => ({ ...p, airPressure: v }))}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Number of Snowflakes: {params.numFlakes}
          </label>
          <Slider
            min={1}
            max={1000}
            stepSize={1}
            labelStepSize={5}
            value={params.numFlakes}
            onChange={(v) => setParams(p => ({ ...p, numFlakes: v }))}
          />
        </div>

        <div className="flex gap-2">
          <Button
            intent={isPlaying ? "danger" : "primary"}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <Button
            intent="none"
            onClick={() => {
              resetSnowflakes();
              setIsPlaying(false);
            }}
          >
            Reset
          </Button>
        </div>

        <Checkbox
          checked={showEngineering}
          onChange={(e) => setShowEngineering(e.target.checked)}
          label="Engineering View"
        />

        <Checkbox
          checked={showTrail}
          onChange={(e) => setShowTrail(e.target.checked)}
          label="Show Trail"
        />
      </Card>

      {/* Canvas */}
      <div className="border border-gray-300">
        <canvas
          ref={canvasRef}
          style={{
            width: '300px',
            height: '1000px'
          }}
        />
      </div>
    </div>
  );
};

export default SnowflakeSimulation;