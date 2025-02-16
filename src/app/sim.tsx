import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../components/ui/card';
import { Slider, Button, Checkbox } from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';

// Simulation Dimensions (in meters unless specified)
const SIM_WIDTH = 10.0;
const SIM_HEIGHT = 10.0;
const SPAWN_HEIGHT = 9.0;
const GROUND_LEVEL = 1.0;
const LIGHT_SOURCE_X = SIM_WIDTH / 2;
const LIGHT_SOURCE_Y = SIM_HEIGHT;
const PIXELS_PER_METER = 200;

// Constants and Types
interface LiveParams {
  g: number;
  airPressure: number;
  windSpeedTop: number;
  windSpeedBottom: number;
  ambientLight: number;
  diffuseLight: number;
  specularStrength: number;
  specularExponent: number;
  beamAngle: number;
  lightFalloffCoeff: number;
  lightconeOpacityTop: number;
  lightconeOpacityBottom: number;
}

interface InitParams {
  numFlakes: number;
  massMean: number;
  massVar: number;
  diameterMean: number;
  diameterVar: number;
  thetaMean: number;
  thetaVar: number;
}

type SimParams = LiveParams & InitParams;

interface SnowflakeState {
  position: [number, number];
  velocity: [number, number];
  theta: number;
  omega: number;
  mass: number;
  diameter: number;
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

const createSnowflake = (initParams: InitParams, liveParams: LiveParams): SnowflakeState => ({
  position: [Math.random() * SIM_WIDTH, SPAWN_HEIGHT],  // Random x position from 0 to SIM_WIDTH meters, fixed y at SPAWN_HEIGHT meters
  velocity: [liveParams.windSpeedTop, 0], // Match wind speed at top, slight downward velocity
  theta: normalizeAngle(normalRandom(initParams.thetaMean * Math.PI / 180, initParams.thetaVar * Math.PI / 180)),
  omega: 0,
  mass: normalRandom(initParams.massMean, initParams.massVar) / 1e6, // Convert mg to kg
  diameter: normalRandom(initParams.diameterMean, initParams.diameterVar) / 1000, // Convert mm to m
});

// Physics update function from previous discussion
function updateSnowflake(
  state: SnowflakeState,
  dt: number,
  { g, airPressure, windSpeedTop, windSpeedBottom }: LiveParams
): SnowflakeState {
  const rho = 1.225 * (airPressure / 1.0);
  
  const nx = Math.cos(state.theta);
  const ny = Math.sin(state.theta);
  
  // Interpolate wind speed based on height
  const heightRatio = state.position[1] / SIM_HEIGHT; // SIM_HEIGHT is max height
  const currentWindSpeed = windSpeedBottom + (windSpeedTop - windSpeedBottom) * heightRatio;
  
  // Adjust velocity for wind
  const relativeVx = state.velocity[0] - currentWindSpeed;
  const vmag = Math.hypot(relativeVx, state.velocity[1]);
  
  // Handle zero velocity case properly
  let vx = 0, vy = -1, aoa = state.theta;  // Default to falling straight down
  if (vmag > 1e-6) {
    vx = relativeVx / vmag;
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
  const Fdrag = 0.5 * rho * Cd * A * vmag * vmag * 1;
  const Flift = 0.5 * rho * Cl * A * vmag * vmag * 1;
  
  // Apply forces - note that drag acts against relative velocity direction
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
  let wrapped_x = new_x;
  
  // Wrap around screen horizontally
  if (new_x < 0) wrapped_x = SIM_WIDTH + (new_x % SIM_WIDTH);
  if (new_x > SIM_WIDTH) wrapped_x = new_x % SIM_WIDTH;
  
  const new_y = state.position[1] + new_vy * dt;
  
  return {
    position: [wrapped_x, new_y],
    velocity: [new_vx, new_vy],
    theta: new_theta,
    omega: new_omega,
    mass: state.mass,
    diameter: state.diameter
  };
}

// DistSlider Component
interface DistSliderProps {
  label: string;
  min: number;
  max: number;
  meanValue: number;
  varValue: number;
  onMeanChange: (value: number) => void;
  onVarChange: (value: number) => void;
}

const DistSlider: React.FC<DistSliderProps> = ({ 
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
  // Split params into live-update refs and initialization-only state
  const liveParams = useRef<LiveParams>({
    g: 9.81,
    airPressure: 0.7,
    windSpeedTop: 2,
    windSpeedBottom: 1,
    ambientLight: 0.15,
    diffuseLight: 0.7,
    specularStrength: 0.95,
    specularExponent: 15,
    beamAngle: 40,
    lightFalloffCoeff: 0.005,
    lightconeOpacityTop: 0.1,
    lightconeOpacityBottom: 0.01
  });

  // Simulation parameters that require reset
  const [params, setParams] = useState<InitParams>({
    numFlakes: 2000,
    massMean: 3.0,
    massVar: 1.0,
    diameterMean: 5.0,
    diameterVar: 1.0,
    thetaMean: 47,
    thetaVar: 70,
  });

  // UI state for controlled components (sliders)
  const [uiState, setUiState] = useState({
    g: liveParams.current.g,
    airPressure: liveParams.current.airPressure,
    windSpeedTop: liveParams.current.windSpeedTop,
    windSpeedBottom: liveParams.current.windSpeedBottom,
    ambientLight: liveParams.current.ambientLight,
    diffuseLight: liveParams.current.diffuseLight,
    specularStrength: liveParams.current.specularStrength,
    specularExponent: liveParams.current.specularExponent,
    beamAngle: liveParams.current.beamAngle,
    lightFalloffCoeff: liveParams.current.lightFalloffCoeff,
    lightconeOpacityTop: liveParams.current.lightconeOpacityTop,
    lightconeOpacityBottom: liveParams.current.lightconeOpacityBottom
  });

  // UI state
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEngineering, setShowEngineering] = useState(false);
  const [showTrail, setShowTrail] = useState(false);
  
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
      .map(() => createSnowflake(params, liveParams.current));
    trailHistoryRef.current = Array(params.numFlakes)
      .fill(null)
      .map(() => []);
  };

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.width = SIM_WIDTH * PIXELS_PER_METER;  // SIM_WIDTH * pixels/meter
    canvas.height = SIM_HEIGHT * PIXELS_PER_METER; // SIM_HEIGHT * pixels/meter
    
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
        const updated = updateSnowflake(flake, subDt, liveParams.current);
        
        // Store trail history
        if (showTrail) {
          if (!trailHistoryRef.current[index]) {
            trailHistoryRef.current[index] = [];
          }
          trailHistoryRef.current[index].push([updated.position[0], updated.position[1]]);
        }
        
        // Reset if below ground level
        if (updated.position[1] < GROUND_LEVEL) {
          trailHistoryRef.current[index] = [];
          return createSnowflake(params, liveParams.current);
        }
        
        return updated;
      });
    }

    // Render
    const ctx = canvasRef.current.getContext('2d')!;
    const scale = PIXELS_PER_METER;
    
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw ground
    ctx.fillStyle = '#333';
    ctx.fillRect(0, ctx.canvas.height - scale * GROUND_LEVEL, ctx.canvas.width, scale * GROUND_LEVEL);

    // Draw light cone
    const screenLightX = LIGHT_SOURCE_X * scale;
    const screenLightY = ctx.canvas.height - LIGHT_SOURCE_Y * scale;
    
    // Create gradient for the light cone
    const gradient = ctx.createRadialGradient(
      screenLightX, screenLightY, 0,
      screenLightX, screenLightY, ctx.canvas.height
    );
    gradient.addColorStop(0, `rgba(255, 255, 255, ${liveParams.current.lightconeOpacityTop})`);
    gradient.addColorStop(1, `rgba(255, 255, 255, ${liveParams.current.lightconeOpacityBottom})`);
    
    // Draw the light cone
    ctx.save();
    ctx.translate(screenLightX, screenLightY);
    ctx.rotate(Math.PI / 2); // Rotate to point downward
    
    // Create light cone path
    ctx.beginPath();
    const angleRad = (liveParams.current.beamAngle / 2) * (Math.PI / 180);
    const coneLength = ctx.canvas.height;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-angleRad) * coneLength, Math.sin(-angleRad) * coneLength);
    ctx.lineTo(Math.cos(angleRad) * coneLength, Math.sin(angleRad) * coneLength);
    ctx.closePath();
    
    // Apply blur filter
    ctx.filter = 'blur(50px)';
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Reset context state
    ctx.filter = 'none';
    ctx.restore();

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
        const brightness = calculateLighting(x, y, nx, ny);
        ctx.strokeStyle = `rgb(${Math.round(brightness * 255)}, ${Math.round(brightness * 255)}, ${Math.round(brightness * 255)})`;
        const pixelDiameter = flake.diameter * 1000 * 1.5; // Convert m to mm, then scale by 1.5px/mm
        ctx.lineWidth = pixelDiameter;
        ctx.beginPath();
        ctx.moveTo(
          screenX - nx * pixelDiameter,
          screenY + ny * pixelDiameter
        );
        ctx.lineTo(
          screenX + nx * pixelDiameter,
          screenY - ny * pixelDiameter
        );
        ctx.stroke();

        // Draw normal indicator
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(
          screenX + nx * pixelDiameter,
          screenY - ny * pixelDiameter,
          3,
          0,
          2 * Math.PI
        );
        ctx.fill();
      } else {
        // Draw elliptical snowflake with lighting
        const nx = Math.cos(flake.theta);
        const ny = Math.sin(flake.theta);
        const brightness = calculateLighting(x, y, nx, ny);
        ctx.fillStyle = `rgb(${Math.round(brightness * 255)}, ${Math.round(brightness * 255)}, ${Math.round(brightness * 255)})`;
        
        // Calculate major and minor axes in pixels
        const majorAxis = flake.diameter * 1000 * 1.5; // Convert m to mm, scale by 1.5px/mm
        const minorAxis = majorAxis / 2; // Minor axis is half the major axis
        
        // Save current transform state
        ctx.save();
        
        // Translate to snowflake center and rotate
        ctx.translate(screenX, screenY);
        ctx.rotate(flake.theta);
        
        // Draw ellipse
        ctx.beginPath();
        ctx.ellipse(0, 0, majorAxis/2, minorAxis/2, 0, 0, 2 * Math.PI);
        ctx.fill();
        
        // Restore transform state
        ctx.restore();
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

  // Calculate lighting for a snowflake
  const calculateLighting = (x: number, y: number, nx: number, ny: number): number => {
    
    // Calculate light direction (normalized)
    const dx = x - LIGHT_SOURCE_X;
    const dy = y - LIGHT_SOURCE_Y;
    const dist = Math.hypot(dx, dy);
    
    // Early return if distance is effectively zero
    if (dist < 1e-6) return liveParams.current.ambientLight;
    
    const lightDirX = dx / dist;
    const lightDirY = dy / dist;
    
    // Calculate angle between light direction and downward vector
    const angleFromDownward = Math.acos((-lightDirY)); // Dot product with (0, -1)
    const angleInDegrees = angleFromDownward * (180 / Math.PI);
    
    // Check if point is within beam cone
    if (angleInDegrees > liveParams.current.beamAngle / 2) {
      return liveParams.current.ambientLight;
    }
    
    // For points within cone, calculate intensity falloff based on angle
    const angleRatio = angleInDegrees / (liveParams.current.beamAngle / 2);
    const intensityFalloff = Math.cos(angleRatio * Math.PI / 2); // Smooth falloff
    
    // Calculate distance-based falloff using inverse square law
    const distanceFalloff = 1.0 / (1.0 + liveParams.current.lightFalloffCoeff * dist * dist);
    
    // Calculate surface lighting using the original dot product
    const dotProduct = Math.abs(lightDirX * ny + lightDirY * nx);
    
    // Calculate components using live params and apply both cone and distance falloff
    const ambient = liveParams.current.ambientLight;
    const diffuse = liveParams.current.diffuseLight * intensityFalloff * distanceFalloff;
    const specular = Math.pow(dotProduct, liveParams.current.specularExponent) * liveParams.current.specularStrength * intensityFalloff;
    const coeffTotal = liveParams.current.ambientLight + liveParams.current.diffuseLight + liveParams.current.specularStrength;
    return Math.min(1.0, (ambient + diffuse + specular) / coeffTotal);
  };

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
            Gravity (m/s²): {uiState.g.toFixed(1)}
          </label>
          <Slider
            min={0}
            max={10}
            stepSize={0.1}
            labelStepSize={2}
            value={uiState.g}
            onChange={(v) => {
              liveParams.current.g = v;
              setUiState(s => ({ ...s, g: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Air Pressure (atm): {uiState.airPressure.toFixed(2)}
          </label>
          <Slider
            min={0}
            max={1}
            stepSize={0.01}
            labelStepSize={0.2}
            value={uiState.airPressure}
            onChange={(v) => {
              liveParams.current.airPressure = v;
              setUiState(s => ({ ...s, airPressure: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Number of Snowflakes: {params.numFlakes}
          </label>
          <Slider
            min={1}
            max={2000}
            stepSize={1}
            labelStepSize={5}
            value={params.numFlakes}
            onChange={(v) => setParams(p => ({ ...p, numFlakes: v }))}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Wind Speed Top (m/s): {uiState.windSpeedTop.toFixed(1)}
          </label>
          <Slider
            min={-2}
            max={2}
            stepSize={0.1}
            labelStepSize={1}
            value={uiState.windSpeedTop}
            onChange={(v) => {
              liveParams.current.windSpeedTop = v;
              setUiState(s => ({ ...s, windSpeedTop: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Wind Speed Bottom (m/s): {uiState.windSpeedBottom.toFixed(1)}
          </label>
          <Slider
            min={-2}
            max={2}
            stepSize={0.1}
            labelStepSize={1}
            value={uiState.windSpeedBottom}
            onChange={(v) => {
              liveParams.current.windSpeedBottom = v;
              setUiState(s => ({ ...s, windSpeedBottom: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Ambient Light: {uiState.ambientLight.toFixed(2)}
          </label>
          <Slider
            min={0}
            max={1}
            stepSize={0.01}
            labelStepSize={0.2}
            value={uiState.ambientLight}
            onChange={(v) => {
              liveParams.current.ambientLight = v;
              setUiState(s => ({ ...s, ambientLight: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Diffuse Light: {uiState.diffuseLight.toFixed(2)}
          </label>
          <Slider
            min={0}
            max={1}
            stepSize={0.01}
            labelStepSize={0.2}
            value={uiState.diffuseLight}
            onChange={(v) => {
              liveParams.current.diffuseLight = v;
              setUiState(s => ({ ...s, diffuseLight: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Specular Strength: {uiState.specularStrength.toFixed(2)}
          </label>
          <Slider
            min={0}
            max={1}
            stepSize={0.01}
            labelStepSize={0.2}
            value={uiState.specularStrength}
            onChange={(v) => {
              liveParams.current.specularStrength = v;
              setUiState(s => ({ ...s, specularStrength: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Specular Exponent: {uiState.specularExponent.toFixed(1)}
          </label>
          <Slider
            min={0}
            max={100}
            stepSize={1}
            labelStepSize={20}
            value={uiState.specularExponent}
            onChange={(v) => {
              liveParams.current.specularExponent = v;
              setUiState(s => ({ ...s, specularExponent: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Beam Angle (degrees): {uiState.beamAngle.toFixed(1)}
          </label>
          <Slider
            min={5}
            max={180}
            stepSize={1}
            labelStepSize={35}
            value={uiState.beamAngle}
            onChange={(v) => {
              liveParams.current.beamAngle = v;
              setUiState(s => ({ ...s, beamAngle: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Light Falloff Coeff: {uiState.lightFalloffCoeff.toFixed(2)}
          </label>
          <Slider
            min={0}
            max={1}
            stepSize={0.01}
            labelStepSize={1}
            value={uiState.lightFalloffCoeff}
            onChange={(v) => {
              liveParams.current.lightFalloffCoeff = v;
              setUiState(s => ({ ...s, lightFalloffCoeff: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Light Cone Top Opacity: {uiState.lightconeOpacityTop.toFixed(2)}
          </label>
          <Slider
            min={0}
            max={1}
            stepSize={0.01}
            labelStepSize={0.2}
            value={uiState.lightconeOpacityTop}
            onChange={(v) => {
              liveParams.current.lightconeOpacityTop = v;
              setUiState(s => ({ ...s, lightconeOpacityTop: v }));
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Light Cone Bottom Opacity: {uiState.lightconeOpacityBottom.toFixed(2)}
          </label>
          <Slider
            min={0}
            max={1}
            stepSize={0.01}
            labelStepSize={0.2}
            value={uiState.lightconeOpacityBottom}
            onChange={(v) => {
              liveParams.current.lightconeOpacityBottom = v;
              setUiState(s => ({ ...s, lightconeOpacityBottom: v }));
            }}
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
            width: `${SIM_WIDTH * PIXELS_PER_METER/2}px`,
            height: `${SIM_HEIGHT * PIXELS_PER_METER/2}px`
          }}
        />
      </div>
    </div>
  );
};

export default SnowflakeSimulation;