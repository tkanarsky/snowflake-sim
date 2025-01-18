import React from 'react'
import { SnowflakeWrapper } from '../components/snowflake-wrapper'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <h1 className="text-4xl font-bold mb-8">Snowflake Physics Simulation</h1>
      <SnowflakeWrapper />
    </main>
  )
}
