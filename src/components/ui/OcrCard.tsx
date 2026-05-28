import React from 'react'

interface OcrCardProps extends React.HTMLAttributes<HTMLDivElement> {
  premium?: boolean
  children: React.ReactNode
}

export const OcrCard: React.FC<OcrCardProps> = ({ premium = false, children, className = '', ...props }) => {
  return (
    <div
      className={`${premium ? 'ocr-card-premium' : 'ocr-card'} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export default OcrCard
