'use client'

import { useEffect, useRef, useState } from 'react'

export default function GeneratorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [userImage, setUserImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [hostName, setHostName] = useState('')
  const [showName, setShowName] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [showDate, setShowDate] = useState('')
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    // Load logo image
    const logo = new Image()
    logo.crossOrigin = "anonymous"
    logo.onload = () => setLogoImage(logo)
    logo.src = '/logo.png'
  }, [])

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        setUserImage(img)
      }
      img.onerror = () => {
        alert("Failed to load the image. Please try a different file.")
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImageUpload(file)
    }
  }

  const drawImageCover = (img: HTMLImageElement, ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    const iw = img.width
    const ih = img.height
    const scale = Math.max(canvasWidth / iw, canvasHeight / ih) * zoom
    const x = (canvasWidth - iw * scale) / 2 + offsetX
    const y = (canvasHeight - ih * scale) / 2 + offsetY
    ctx.drawImage(img, x, y, iw * scale, ih * scale)
  }

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const dayAbbr = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'][date.getDay()]
    const monthAbbr = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'][date.getMonth()]
    const dayOfMonth = date.getDate()
    return { dayAbbr, monthAbbr, dayOfMonth }
  }

  const generateArtwork = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const timeRange = (startTime && endTime) ? `${startTime} - ${endTime} EST` : "00:00 - 00:00 EST"

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw background image
    if (userImage) {
      drawImageCover(userImage, ctx, canvas.width, canvas.height)
    } else if (logoImage) {
      // Use logo as default background when no user image is provided
      drawImageCover(logoImage, ctx, canvas.width, canvas.height)
    } else {
      ctx.fillStyle = "#333"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // Draw black corner bars manually
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 1700, 225, 1575) // vertical bar (left)
    ctx.fillRect(0, 2785, 1275, 225) // horizontal bar (bottom)

    // Draw logo
    if (logoImage) {
      const logoWidth = 250
      const logoHeight = 250
      const logoX = -10
      const logoY = 1690
      ctx.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight)
    }

    // Draw text
    ctx.fillStyle = "white"
    ctx.textAlign = "left"
    ctx.font = "70px Eurostile"

    if (showDate) {
      const { dayAbbr, monthAbbr, dayOfMonth } = formatDate(showDate)
      ctx.save()
      ctx.translate(240, 2140)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(`${dayAbbr} ${monthAbbr} ${dayOfMonth}`, -660, -145)
      ctx.fillText(timeRange, -660, -60)
      ctx.restore()
    }

    const fullTitle = (showName && hostName) 
      ? `${showName}: ${hostName}` 
      : showName || hostName

    if (fullTitle) {
      const fullTitleLength = fullTitle.length
      if (fullTitleLength > 30) {
        ctx.font = "bold 45px Eurostile"
      } else {
        ctx.font = "bold 52px Eurostile"
      }
      ctx.fillText(fullTitle, 40, 2890)
    }

    ctx.font = "50px Eurostile"
    ctx.fillText("Listen Live or Archived on sector.fm", 40, 2955)
  }

  const downloadImage = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    
    const fullTitle = (showName && hostName)
      ? `${showName}: ${hostName}`
      : showName || hostName || "artwork"

    const datePart = showDate ? ` - ${showDate}` : ""
    const safeFilename = `${fullTitle}${datePart}`.replace(/[\/\\?%*:|"<>]/g, '-')

    // Reduce size for mobile to avoid freeze/crash
    const tempCanvas = document.createElement('canvas')
    const scale = isMobile ? 0.5 : 1
    tempCanvas.width = canvas.width * scale
    tempCanvas.height = canvas.height * scale

    const tempCtx = tempCanvas.getContext('2d')
    if (tempCtx) {
      tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height)
    }

    const image = tempCanvas.toDataURL("image/png")

    if (isMobile) {
      const newWindow = window.open()
      if (newWindow) {
        newWindow.document.write('<img src="' + image + '" style="width:100%;">')
      } else {
        alert("Pop-up blocked! Please allow pop-ups for this site.")
      }
    } else {
      const link = document.createElement('a')
      link.download = `${safeFilename}.png`
      link.href = image
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  // Generate artwork when dependencies change
  useEffect(() => {
    generateArtwork()
  }, [userImage, zoom, offsetX, offsetY, hostName, showName, startTime, endTime, showDate, logoImage])

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0')
    return `${hour}:00`
  })

  return (
    <div className="min-h-screen bg-black text-white p-5">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-center">Artwork Generator</h2>

        {/* Hidden file input */}
        <input 
          type="file" 
          ref={fileInputRef}
          accept="image/*" 
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Upload zone */}
        <div 
          className="border-2 border-dashed border-gray-600 p-8 bg-gray-800 rounded-lg cursor-pointer mb-5 hover:bg-gray-700 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => e.preventDefault()}
        >
          <p className="text-center">📂 Drag & drop your image here or click to upload</p>
          {userImage && (
            <div className="mt-4">
              <img 
                src={userImage.src} 
                alt="Preview" 
                className="max-w-full h-auto rounded mx-auto"
              />
              <p className="text-sm text-gray-400 mt-2">Image uploaded successfully.</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-bold mb-2">Zoom</label>
            <input 
              type="range" 
              min="0.5" 
              max="2" 
              step="0.01" 
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Horizontal Position</label>
            <input 
              type="range" 
              min="-750" 
              max="750" 
              step="1" 
              value={offsetX}
              onChange={(e) => setOffsetX(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Vertical Position</label>
            <input 
              type="range" 
              min="-750" 
              max="750" 
              step="1" 
              value={offsetY}
              onChange={(e) => setOffsetY(parseInt(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        {/* Form inputs */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-bold mb-2">Host Name (optional)</label>
            <input 
              type="text" 
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Enter host name"
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Show Name (optional)</label>
            <input 
              type="text" 
              value={showName}
              onChange={(e) => setShowName(e.target.value)}
              placeholder="Enter show name"
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Start Time</label>
            <select 
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded text-white"
            >
              <option value="">Select start time</option>
              {timeOptions.map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">End Time</label>
            <select 
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded text-white"
            >
              <option value="">Select end time</option>
              {timeOptions.map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Show Date</label>
            <input 
              type="date" 
              value={showDate}
              onChange={(e) => setShowDate(e.target.value)}
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded text-white"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4 mb-6">
          <button 
            onClick={generateArtwork}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded transition-colors"
          >
            Generate
          </button>
          <button 
            onClick={downloadImage}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded transition-colors"
          >
            Download
          </button>
        </div>

        {/* Canvas */}
        <canvas 
          ref={canvasRef}
          width={3000} 
          height={3000}
          className="w-full max-w-full h-auto border border-gray-600 bg-white"
        />
      </div>

      <style jsx global>{`
        @font-face {
          font-family: 'Eurostile';
          src: url('/fonts/EurostileBQ-BoldExtended.otf') format('opentype');
        }
      `}</style>
    </div>
  )
}
