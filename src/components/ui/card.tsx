import React from 'react'
import { Card as BPCard } from '@blueprintjs/core'
import type { CardProps as BPCardProps } from '@blueprintjs/core'

export interface CardProps extends BPCardProps {
  children: React.ReactNode
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <BPCard className={className} {...props}>
      {children}
    </BPCard>
  )
} 