import SwiftUI

struct RadioPlayerView: View {
    @StateObject private var radio = RadioPlayer.shared
    @State private var maximized = false
    private let gold = Color(red: 0.95, green: 0.72, blue: 0.20)
    private let midnight = Color(red: 0.025, green: 0.105, blue: 0.20)

    var body: some View {
        let lines = LyricsParser.parse(radio.lyrics)
        let activeLine = lines.last(where: { $0.seconds <= radio.currentSeconds })?.id
        let ghostLine = lines.last(where: { $0.seconds <= radio.currentSeconds })?.text
        ScrollView {
            VStack(spacing: 20) {
                Text("SNTSS · SECCIÓN I PUEBLA")
                    .font(.caption.weight(.bold)).tracking(2).foregroundStyle(gold)
                Text("Radio Sindical")
                    .font(.system(size: 36, weight: .bold, design: .serif))
                ZStack {
                    Circle().fill(Color(red: 0.08, green: 0.23, blue: 0.34))
                    Circle().strokeBorder(gold, lineWidth: 7).padding(9)
                    Circle().strokeBorder(.white.opacity(0.18), lineWidth: 2).padding(32)
                    Circle().strokeBorder(.white.opacity(0.12), lineWidth: 2).padding(50)
                    Circle().fill(gold).padding(66)
                    Image(systemName: "play.fill").font(.system(size: 42)).foregroundStyle(midnight)
                    if let artwork = radio.selected?.artworkURL {
                        AsyncImage(url: artwork) { image in
                            image.resizable().scaledToFill().clipShape(Circle())
                        } placeholder: { Color.clear }
                        .padding(16)
                    }
                    if let ghostLine, !ghostLine.isEmpty {
                        VStack {
                            Spacer()
                            Text(ghostLine)
                                .font(.system(size: 24, weight: .bold, design: .rounded))
                                .multilineTextAlignment(.center).lineLimit(3)
                                .foregroundStyle(gold)
                                .shadow(color: .black, radius: 8)
                                .padding(12).frame(maxWidth: .infinity)
                                .background(.black.opacity(0.72))
                        }
                        .clipShape(Circle()).padding(16)
                        .allowsHitTesting(false)
                    }
                }
                .frame(width: 210, height: 210)
                .accessibilityHidden(true)
                Button { maximized = true } label: {
                    Label("Maximizar portada", systemImage: "arrow.up.left.and.arrow.down.right")
                }
                .font(.subheadline.bold()).foregroundStyle(gold)
                VStack(spacing: 5) {
                    Text(radio.selected?.title ?? "Tu música te acompaña")
                        .font(.title2.bold()).multilineTextAlignment(.center)
                    Text(radio.selected.flatMap { $0.artist.isEmpty ? nil : $0.artist } ?? "Radio Sindical")
                        .font(.body).foregroundStyle(.white.opacity(0.74))
                }
                if radio.selected != nil {
                    Slider(value: Binding(get: { min(radio.currentSeconds, max(radio.durationSeconds, 1)) },
                                          set: { radio.seek(to: $0) }),
                           in: 0...max(radio.durationSeconds, 1))
                        .tint(gold).accessibilityLabel("Posición de la canción")
                }
                HStack(spacing: 32) {
                    Button { radio.previous() } label: { Image(systemName: "backward.end.fill") }
                        .accessibilityLabel("Anterior")
                    Button { radio.togglePlayback() } label: {
                        Image(systemName: radio.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 62)).foregroundStyle(gold)
                    }.accessibilityLabel(radio.isPlaying ? "Pausar" : "Reproducir")
                    Button { radio.next() } label: { Image(systemName: "forward.end.fill") }
                        .accessibilityLabel("Siguiente")
                }.font(.title).buttonStyle(.plain)
                Text("DeVi presenta la siguiente canción cada dos temas")
                    .font(.subheadline).foregroundStyle(.white.opacity(0.68))
                    .multilineTextAlignment(.center)
                if let message = radio.message {
                    Text(message).font(.subheadline).foregroundStyle(gold)
                        .multilineTextAlignment(.center)
                }
                VStack(alignment: .leading, spacing: 12) {
                    Text("Letra de la canción").font(.headline)
                    if !lines.isEmpty {
                        ScrollViewReader { proxy in
                            ScrollView {
                                VStack(alignment: .leading, spacing: 12) {
                                    ForEach(lines) { line in
                                        Text(line.text)
                                            .font(activeLine == line.id ? .system(size: 26, weight: .bold, design: .rounded) : .system(size: 20))
                                            .foregroundStyle(activeLine == line.id ? gold : .white.opacity(0.72))
                                            .id(line.id)
                                    }
                                }.frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .frame(height: 260)
                            .onChange(of: activeLine) { id in
                                if let id { withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(id, anchor: .center) } }
                            }
                        }
                    } else {
                        Text(radio.lyrics.isEmpty ? "La letra aparecerá aquí cuando esté disponible." : radio.lyrics)
                            .font(.body).foregroundStyle(.white.opacity(0.75))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
                if !radio.songs.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Biblioteca").font(.headline)
                        ForEach(radio.songs) { song in
                            Button {
                                radio.play(song)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(song.title).font(.body.weight(.semibold))
                                        Text(song.artist.isEmpty ? "Radio Sindical" : song.artist)
                                            .font(.subheadline).foregroundStyle(.white.opacity(0.65))
                                    }
                                    Spacer()
                                    if radio.selected?.id == song.id { Image(systemName: "waveform").foregroundStyle(gold) }
                                }
                            }.buttonStyle(.plain).padding(.vertical, 6)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(maxWidth: 540).padding(24).frame(maxWidth: .infinity)
        }
        .background(midnight.ignoresSafeArea())
        .foregroundStyle(.white)
        .fullScreenCover(isPresented: $maximized) { RadioFullScreenView(radio: radio) }
        .task {
            while !Task.isCancelled {
                await radio.refresh()
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
    }
}

@MainActor private struct RadioFullScreenView: View {
    @ObservedObject var radio: RadioPlayer
    @Environment(\.dismiss) private var dismiss
    @State private var previousIdleTimer = false

    private let gold = Color(red: 0.95, green: 0.72, blue: 0.20)

    var body: some View {
        let lines = LyricsParser.parse(radio.lyrics)
        let active = lines.last(where: { $0.seconds <= radio.currentSeconds })
        GeometryReader { geometry in
            VStack(spacing: 14) {
                HStack {
                    Text("Radio Sindical").font(.headline).foregroundStyle(.white)
                    Spacer()
                    Button { dismiss() } label: {
                        Label("Cerrar", systemImage: "xmark.circle.fill")
                            .font(.title3).foregroundStyle(.white)
                    }
                    .accessibilityLabel("Cerrar pantalla completa")
                }
                .padding(.horizontal, 20)

                ZStack(alignment: .bottom) {
                    RoundedRectangle(cornerRadius: 24).fill(.white.opacity(0.07))
                    if let url = radio.selected?.artworkURL {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFit()
                        } placeholder: {
                            Image(systemName: "music.note").font(.system(size: 88)).foregroundStyle(gold)
                        }
                    } else {
                        Image(systemName: "music.note").font(.system(size: 88)).foregroundStyle(gold)
                    }
                    if let active {
                        Text(active.text.isEmpty ? "♪" : active.text)
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .multilineTextAlignment(.center)
                            .foregroundStyle(gold)
                            .shadow(color: .black, radius: 10)
                            .padding(18).frame(maxWidth: .infinity)
                            .background(.black.opacity(0.74))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: max(200, geometry.size.height * 0.43))
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .padding(.horizontal, 20)

                Text(radio.selected?.title ?? "Radio Sindical")
                    .font(.title2.bold()).multilineTextAlignment(.center).foregroundStyle(.white)
                    .lineLimit(2)
                Text(radio.selected?.artist ?? "")
                    .font(.subheadline).foregroundStyle(.white.opacity(0.72))
                if !lines.isEmpty {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                ForEach(lines) { line in
                                    Text(line.text.isEmpty ? "♪" : line.text)
                                        .font(.system(size: active?.id == line.id ? 28 : 20,
                                                      weight: active?.id == line.id ? .bold : .regular,
                                                      design: .rounded))
                                        .multilineTextAlignment(.center)
                                        .foregroundStyle(active?.id == line.id ? gold : .white.opacity(0.6))
                                        .frame(maxWidth: .infinity).id(line.id)
                                }
                            }
                        }
                        .onChange(of: active?.id) { id in
                            if let id { withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(id, anchor: .center) } }
                        }
                    }
                } else {
                    ScrollView {
                        Text(radio.lyrics.isEmpty ? "La letra aparecerá cuando esté disponible." : radio.lyrics)
                            .font(.title3).multilineTextAlignment(.center).foregroundStyle(.white.opacity(0.78))
                    }
                }
            }
            .padding(.top, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(red: 0.025, green: 0.105, blue: 0.20).ignoresSafeArea())
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack(spacing: 35) {
                Button { radio.previous() } label: { Image(systemName: "backward.end.fill") }
                    .accessibilityLabel("Anterior")
                Button { radio.togglePlayback() } label: {
                    Image(systemName: radio.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 60)).foregroundStyle(gold)
                }.accessibilityLabel(radio.isPlaying ? "Pausar" : "Reproducir")
                Button { radio.next() } label: { Image(systemName: "forward.end.fill") }
                    .accessibilityLabel("Siguiente")
            }
            .font(.title).buttonStyle(.plain).foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color(red: 0.025, green: 0.105, blue: 0.20))
        }
        .onAppear {
            previousIdleTimer = UIApplication.shared.isIdleTimerDisabled
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = previousIdleTimer }
    }
}
