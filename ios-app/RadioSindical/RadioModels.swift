import Foundation

struct RadioSong: Decodable, Identifiable, Equatable {
    let id: Int
    let title: String
    let artist: String
    let album: String
    let availableQualities: [Int]
    let coverUrl: String?

    var artworkURL: URL? {
        guard let coverUrl, coverUrl.hasPrefix("/api/radio/cover/") else { return nil }
        return URL(string: "https://sntss1puebla.com\(coverUrl)")
    }

    var audioURL: URL {
        var parts = URLComponents(string: "https://sntss1puebla.com/api/radio/audio/\(id)")!
        if availableQualities.contains(192) {
            parts.queryItems = [URLQueryItem(name: "quality", value: "192")]
        }
        return parts.url!
    }
}

struct RadioCatalogResponse: Decodable {
    let tracks: [RadioSong]
    let commercials: [RadioSong]
    let commercialIntervalMinutes: Int
    let facts: [RadioFact]
}

struct RadioFact: Decodable { let id: String; let text: String }

extension RadioSong {
    var commercialURL: URL { URL(string: "https://sntss1puebla.com/api/radio/commercial/\(id)")! }
}

struct RadioLyricResponse: Decodable {
    let lyrics: String
}

struct TimedLyric: Identifiable {
    let id: Int
    let seconds: Double
    let text: String
}

enum LyricsParser {
    private static let stamp = try! NSRegularExpression(
        pattern: #"^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$"#
    )

    static func parse(_ raw: String) -> [TimedLyric] {
        raw.components(separatedBy: .newlines).enumerated().compactMap { index, line in
            let range = NSRange(line.startIndex..<line.endIndex, in: line)
            guard let match = stamp.firstMatch(in: line, range: range), match.range == range else { return nil }
            func part(_ number: Int) -> String {
                guard let range = Range(match.range(at: number), in: line) else { return "" }
                return String(line[range])
            }
            guard let minutes = Int(part(1)), let seconds = Int(part(2)), seconds < 60 else { return nil }
            let fraction = part(3)
            let fractionValue = Double(Int(fraction) ?? 0) / pow(10.0, Double(fraction.count))
            let text = part(4)
            return TimedLyric(id: index, seconds: Double(minutes * 60 + seconds) + fractionValue,
                              text: text.isEmpty ? "♪" : text)
        }.sorted { $0.seconds < $1.seconds }
    }
}
