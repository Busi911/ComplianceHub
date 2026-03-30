export default function EstimationRulesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Schätzlogik & Regeln</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Wie das System Verpackungsgewichte schätzt und was die Werte bedeuten
        </p>
      </div>

      {/* Priority overview */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Priorität der Schätzmethoden</h2>
        <p className="text-sm text-gray-600 mb-4">
          Das System wählt immer die <strong>beste verfügbare Methode</strong> — von der genauesten zur ungenauesten:
        </p>
        <ol className="space-y-4">
          <li className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
            <div>
              <div className="font-medium text-gray-900">Eigene Stichproben <span className="ml-2 px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">Methode: own_sampling_avg_nX</span></div>
              <p className="text-sm text-gray-600 mt-1">
                Wenn für dieses Produkt bereits echte Wiegungen vorhanden sind, wird deren <strong>Durchschnitt</strong> verwendet.
                Die Konfidenz steigt mit jeder weiteren Stichprobe (ab 1 Stichprobe: 65%, ab 3: 95%).
              </p>
              <div className="mt-1 text-xs text-gray-400 font-mono">Konfidenz = min(0.50 + n × 0.15, 0.95)</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
            <div>
              <div className="font-medium text-gray-900">Ähnliche Produkte <span className="ml-2 px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">Methode: similar_products_nX</span></div>
              <p className="text-sm text-gray-600 mt-1">
                Wenn keine eigenen Stichproben vorhanden, sucht das System ähnliche Produkte <strong>mit echten Messwerten</strong>.
                Die Ähnlichkeit wird nach mehreren Kriterien bewertet (siehe unten). Der Durchschnitt der gefundenen Produkte wird verwendet.
              </p>
              <div className="mt-1 text-xs text-gray-400 font-mono">Konfidenz = 0.20–0.78 je nach Ähnlichkeit</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-400 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
            <div>
              <div className="font-medium text-gray-900">Kategorie-Durchschnitt <span className="ml-2 px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">Methode: category_avg_nX</span></div>
              <p className="text-sm text-gray-600 mt-1">
                Wenn keine ähnlichen Produkte gefunden werden, wird der Durchschnitt <strong>aller gemessenen Produkte in derselben Kategorie</strong> verwendet.
                Dies ist die ungenaueste Methode.
              </p>
              <div className="mt-1 text-xs text-gray-400 font-mono">Konfidenz = 0.20 (fest)</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-gray-400 text-white rounded-full flex items-center justify-center font-bold text-sm">–</div>
            <div>
              <div className="font-medium text-gray-900">Kein Ergebnis <span className="ml-2 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">Status: IMPORTED</span></div>
              <p className="text-sm text-gray-600 mt-1">
                Wenn in der Kategorie noch gar keine Messwerte vorhanden sind, bleibt der Status auf <em>Importiert</em>.
                Lösung: Mindestens ein Produkt in dieser Kategorie wiegen.
              </p>
            </div>
          </li>
        </ol>
      </div>

      {/* Similarity criteria */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Ähnlichkeitsberechnung im Detail</h2>
        <p className="text-sm text-gray-600 mb-4">
          Für die Methode „Ähnliche Produkte" wird jedes Kandidaten-Produkt nach folgenden Kriterien bewertet.
          Je mehr Punkte, desto ähnlicher — und desto höher die Konfidenz:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2 font-medium text-gray-600">Kriterium</th>
                <th className="px-4 py-2 font-medium text-gray-600">Bedingung</th>
                <th className="px-4 py-2 font-medium text-gray-600 text-center">Punkte</th>
                <th className="px-4 py-2 font-medium text-gray-600">Begründung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {([
                ["Unterkategorie", "Exakt gleich (z. B. SSD 2.5)", "3", "Gleicher Produkttyp, sehr ähnliche Verpackung"],
                ["Kategorie", "Exakt gleich (z. B. Festplatte)", "2", "Gleiche Produktklasse"],
                ["Marke", "Exakt gleich", "2", "Gleiche Marke, oft gleiche Verpackungsstrategie"],
                ["Hersteller", "Exakt gleich", "1", "Ähnliche Produktion"],
                ["EK-Preis", "Abweichung unter 10%", "2", "Ähnlicher Preis, ähnliches Produkt"],
                ["EK-Preis", "Abweichung unter 30%", "1", ""],
                ["Bruttogewicht", "Abweichung unter 10%", "2", "Ähnliches Gewicht, ähnliche Verpackungsmenge"],
                ["Bruttogewicht", "Abweichung unter 25%", "1", ""],
                ["Bruttovolumen (L x B x H)", "Abweichung unter 10%", "3", "Ähnliches Volumen, ähnliche Verpackungsfläche"],
                ["Bruttovolumen", "Abweichung unter 25%", "2", ""],
                ["Bruttovolumen", "Abweichung unter 50%", "1", ""],
                ["Verpackungsquotient", "(Brutto-Netto)/Volumen: Abweichung unter 15%", "2", "Gleiche Verpackungsdichte ist starkes Signal"],
                ["Verpackungsquotient", "Abweichung unter 35%", "1", ""],
              ] as [string, string, string, string][]).map(([criterion, condition, points, reason], i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{criterion}</td>
                  <td className="px-4 py-2 text-gray-600">{condition}</td>
                  <td className="px-4 py-2 text-center font-mono font-bold text-blue-700">+{points}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-700">
          <strong>Max. 20 Punkte möglich.</strong> Die Konfidenz wird als <code>0.20 + (Punkte / 20) × 0.58</code> berechnet, also zwischen 20% und 78%.
          Bei eigenen Stichproben kann die Konfidenz bis zu 95% erreichen.
        </div>
      </div>

      {/* Status explanation */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Status-Bedeutung</h2>
        <div className="space-y-3">
          {[
            { status: "IMPORTED", label: "Importiert", color: "bg-gray-100 text-gray-700", desc: "Produkt wurde importiert. Noch keine Schätzung vorhanden (zu wenige Vergleichsprodukte in der Kategorie)." },
            { status: "ESTIMATED", label: "Geschätzt", color: "bg-yellow-100 text-yellow-800", desc: "Das System hat automatisch aus ähnlichen Produkten oder dem Kategorie-Durchschnitt geschätzt. Kein Mensch war beteiligt. Die Werte sind Anhaltspunkte, keine Messungen." },
            { status: "SAMPLED", label: "Gemessen", color: "bg-green-100 text-green-800", desc: "Mindestens eine echte Wiegung wurde durchgeführt. Die aktuellen Werte basieren auf dem Durchschnitt aller eigenen Stichproben." },
            { status: "REVIEWED", label: "Geprüft", color: "bg-blue-100 text-blue-800", desc: "Die Werte wurden manuell geprüft und als korrekt bestätigt. Höchste Verlässlichkeit." },
          ].map((s) => (
            <div key={s.status} className="flex items-start gap-3">
              <span className={`px-2 py-1 rounded border text-xs font-medium flex-shrink-0 ${s.color}`}>{s.label}</span>
              <p className="text-sm text-gray-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Improvement tips */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Wie wird das System besser?</h2>
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex gap-3">
            <span className="text-green-600 font-bold flex-shrink-0">1.</span>
            <p><strong>Mehr Stichproben = bessere Schätzungen.</strong> Jede neue Wiegung verbessert sowohl das direkt gemessene Produkt als auch alle ähnlichen Produkte ohne eigene Messung.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-green-600 font-bold flex-shrink-0">2.</span>
            <p><strong>Vollständige Stammdaten helfen.</strong> Produkte mit Bruttomaßen, Gewicht und Preis werden viel präziser gematcht als solche ohne Angaben.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-green-600 font-bold flex-shrink-0">3.</span>
            <p><strong>Stichproben-Prioritätsliste nutzen.</strong> Unter <em>Stichproben → Prioritätsliste</em> siehst du welche Produkte den größten Schätzfehler haben und als nächstes gewogen werden sollten.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-green-600 font-bold flex-shrink-0">4.</span>
            <p><strong>Unterkategorien pflegen.</strong> Die Unterkategorie ist das stärkste Ähnlichkeitssignal. „SSD 2.5" findet viel bessere Matches als nur „Festplatte".</p>
          </div>
        </div>
      </div>
    </div>
  );
}
