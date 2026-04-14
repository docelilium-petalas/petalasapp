'use client'

import React, { useState } from 'react'

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    fallback?: React.ReactNode
}

export function ImageWithFallback({ src, alt, className, fallback, ...props }: ImageWithFallbackProps) {
    const [error, setError] = useState(false)

    if (error && fallback) {
        return <>{fallback}</>
    }

    return (
        <img
            src={error ? undefined : src}
            alt={alt}
            className={className}
            onError={() => setError(true)}
            style={error ? { display: 'none' } : undefined}
            {...props}
        />
    )
}
