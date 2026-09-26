import CarPlay
import UIKit

/** The phone shows lyrics; CarPlay shows the driver's standard browse and playback templates. */
@MainActor final class RadioCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private weak var interfaceController: CPInterfaceController?
    private let radio = RadioPlayer.shared
    private var refreshTask: Task<Void, Never>?

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        self.interfaceController = interfaceController
        showSongs()
        refreshTask?.cancel()
        refreshTask = Task {
            while !Task.isCancelled {
                await radio.refresh()
                showSongs()
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        self.interfaceController = nil
        refreshTask?.cancel()
        refreshTask = nil
    }

    private func showSongs() {
        let items: [CPListItem] = radio.songs.map { song in
            let item = CPListItem(text: song.title,
                                  detailText: song.artist.isEmpty ? "Radio Sindical" : song.artist)
            item.handler = { [weak self] _, complete in
                Task { @MainActor in
                    self?.radio.play(song)
                    self?.interfaceController?.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
                    complete()
                }
            }
            return item
        }
        let section = CPListSection(items: items.isEmpty
            ? [CPListItem(text: "Abre Radio Sindical en tu iPhone para cargar la biblioteca", detailText: nil)]
            : items)
        let template = CPListTemplate(title: "Radio Sindical", sections: [section])
        interfaceController?.setRootTemplate(template, animated: true, completion: nil)
    }
}
