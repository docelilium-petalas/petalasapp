import React from 'react'

interface OcrGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  strong?: boolean
  children: React.ReactNode
}

export const OcrGlass: React.FC<OcrGlassProps> = ({ strong = false, children, className = '', ...props }) => {
  return (
    <div
      className={`${strong ? 'ocr-glass-strong' : 'ocr-glass'} rounded-2xl ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export default OcrGlass
