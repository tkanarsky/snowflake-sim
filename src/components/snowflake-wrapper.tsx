'use client'

import React from 'react'
import dynamic from 'next/dynamic'

const SnowflakeSimulation = dynamic(() => import('../app/sim'), { ssr: false })

export function SnowflakeWrapper() {
  return <SnowflakeSimulation />
} 