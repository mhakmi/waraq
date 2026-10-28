// Draws the Google Play feature graphic, 1024 by 500, from the approved brand files.
//
//   swift dev/feature-graphic.swift <brand folder> <output png>
//
// The brand folder is /Users/mhakmi/mhakmi.dev/brand. The mark comes from
// waraq/paper-loop/launcher.svg and the type is the brand's IBM Plex Sans.
import AppKit
import CoreText

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
  print("usage: swift dev/feature-graphic.swift <brand folder> <output png>")
  exit(1)
}
let brand = URL(fileURLWithPath: arguments[1])
let output = URL(fileURLWithPath: arguments[2])

let width = 1024
let height = 500
let background = NSColor(srgbRed: 0x1f / 255, green: 0x3b / 255, blue: 0x6e / 255, alpha: 1)
let paper = NSColor(srgbRed: 0xf6 / 255, green: 0xf4 / 255, blue: 0xee / 255, alpha: 1)
let softBlue = NSColor(srgbRed: 0xa9 / 255, green: 0xc1 / 255, blue: 0xec / 255, alpha: 1)

let fontFile = brand.appendingPathComponent("fonts/ibm-plex-sans.woff2")
guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(fontFile as CFURL) as? [CTFontDescriptor],
  let plex = descriptors.first
else {
  print("could not load \(fontFile.path)")
  exit(1)
}
let nameFont = CTFontCreateWithFontDescriptor(plex, 128, nil) as NSFont
let lineFont = CTFontCreateWithFontDescriptor(plex, 34, nil) as NSFont
print("type: \(nameFont.fontName)")

let markFile = brand.appendingPathComponent("waraq/paper-loop/launcher.svg")
guard let mark = NSImage(contentsOf: markFile) else {
  print("could not read \(markFile.path)")
  exit(1)
}

let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
  samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB,
  bytesPerRow: 0, bitsPerPixel: 32)!
bitmap.size = NSSize(width: width, height: height)
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)

background.setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

// launcher.svg has the same background colour behind the mark, so its square edge does not show.
let markSize = 300.0
mark.draw(in: NSRect(x: 96, y: (Double(height) - markSize) / 2, width: markSize, height: markSize))

let name = NSAttributedString(string: "Waraq", attributes: [.font: nameFont, .foregroundColor: paper])
let line = NSAttributedString(
  string: "Scan, find, and file your paperwork",
  attributes: [.font: lineFont, .foregroundColor: softBlue])
let textLeft = 430.0
name.draw(at: NSPoint(x: textLeft, y: 236))
line.draw(at: NSPoint(x: textLeft, y: 178))

let lineEnd = textLeft + line.size().width
if lineEnd > Double(width) - 48 {
  print("the line ends at \(Int(lineEnd)) px, past the right margin")
  exit(1)
}

NSGraphicsContext.current = nil
// Play takes a PNG with no alpha channel for the feature graphic, so the bitmap has none.
try bitmap.representation(using: .png, properties: [:])!.write(to: output)
print("\(output.path): \(width) x \(height)")
