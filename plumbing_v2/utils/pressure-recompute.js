/**
 * Tüm boruların basıncını upstream zincirini takip ederek yeniden hesaplar.
 *
 * Kurallar:
 *  - Sayaca bağlı boru → sayac.basinc
 *  - Servis kutusuna bağlı boru → kutu.kutuBasinc
 *  - Başka boruya bağlı boru:
 *      • parent borunun p2 ucunda (boruPozisyonu ≥ 0.5) bir regülatör varsa
 *        → regulator.cikisBasinc
 *      • aksi → parent borunun basıncı (miras)
 */
export function recomputeAllPressures(manager) {
    if (!manager?.pipes) return;

    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    const cache = new Map();

    function compute(pipeId, visiting = new Set()) {
        if (cache.has(pipeId)) return cache.get(pipeId);
        if (visiting.has(pipeId)) return 21;
        visiting.add(pipeId);

        const pipe = pipeMap.get(pipeId);
        if (!pipe) return 21;

        const bag = pipe.baslangicBaglanti;
        let result = pipe.basinc != null ? Number(pipe.basinc) : 21;

        if (bag?.tip === 'sayac') {
            const sayac = manager.components.find(c => c.id === bag.hedefId);
            // Sayaç basınç düşürmez: çıkış basıncı = giriş borusunun basıncı.
            // Sayacın fleks giriş borusu varsa onun basıncını izle ve sayac.basinc'ı senkronla;
            // yoksa (örn. sayaç kaynak rolündeyse) elle girilmiş sayac.basinc'a düş.
            const girisPipeId = sayac?.fleksBaglanti?.boruId;
            if (sayac && girisPipeId && pipeMap.has(girisPipeId)) {
                result = compute(girisPipeId, visiting);
                sayac.basinc = String(result);
            } else {
                result = sayac?.basinc != null ? Number(sayac.basinc) : 21;
            }
        } else if (bag?.tip === 'servis_kutusu') {
            const kutu = manager.components.find(c => c.id === bag.hedefId);
            result = kutu?.kutuBasinc != null ? Number(kutu.kutuBasinc) : 21;
        } else if (bag?.tip === 'boru') {
            const parent = pipeMap.get(bag.hedefId);
            if (parent) {
                // Parent üzerinde p2 tarafına yakın bir regülatör varsa, çıkış basıncı bu boruya geçer.
                const regOnP2 = manager.components.find(c =>
                    c.type === 'regulator' &&
                    c.bagliBoruId === parent.id &&
                    (c.boruPozisyonu || 0) >= 0.5
                );
                if (regOnP2) {
                    result = Number(regOnP2.cikisBasinc) || 21;
                } else {
                    result = compute(parent.id, visiting);
                }
            }
        }

        cache.set(pipeId, result);
        return result;
    }

    manager.pipes.forEach(p => { p.basinc = compute(p.id); });

    // Sayaç çıkış borusu olmayan sayaçların basıncı yukarıdaki döngüde
    // güncellenmemiş olabilir — fleks giriş borusundan açıkça türet.
    (manager.components || []).forEach(sayac => {
        if (sayac.type !== 'sayac') return;
        const girisPipeId = sayac.fleksBaglanti?.boruId;
        if (!girisPipeId || !pipeMap.has(girisPipeId)) return;
        const p = compute(girisPipeId);
        if (Number.isFinite(p)) sayac.basinc = String(p);
    });
}
