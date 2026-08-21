interface AvatarProps {
  initials: string
  imageUrl?: string | null
  size?: 'sm' | 'md'
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
}

export function Avatar({ initials, imageUrl, size = 'md' }: AvatarProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={initials}
        className={`${SIZE_CLASSES[size]} rounded-full object-cover shrink-0`}
      />
    )
  }

  return (
    <div
      className={`${SIZE_CLASSES[size]} shrink-0 rounded-full bg-[var(--accent)]/15 text-[var(--accent-ink)] font-semibold flex items-center justify-center`}
    >
      {initials}
    </div>
  )
}
