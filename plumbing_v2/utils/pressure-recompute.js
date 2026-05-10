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
 *
 *  - Son aşama: her regülatör için aşağı yönlü ağaç (sayaç bağlantıları dahil)
 *    regülatör çıkış basıncında olmalı; bu özellik sayaç giriş borusu eski
 *    referansa sahipse cascade'in atlayabileceği post-meter hatları da
 *    güvenli şekilde post-reg basıncına çeker.
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

    // ── Güvenlik geçişi: regülatör sonrası ağaç regülatör çıkış basıncında olmalı ─
    // Sayaç giriş borusu (fleksBaglanti.boruId) eski/yanlış kalmış olabilir;
    // bu durumda yukarıdaki cascade post-meter hatlara post-reg basıncı taşıyamaz.
    // Her regülatör için aşağı yönlü ağacı (sayaç bağlantılarından da geçerek)
    // gezip pipe.basinc'ı reg.cikisBasinc'a sabitle.
    propagateRegulatorsDownstream(manager, pipeMap);
}

function propagateRegulatorsDownstream(manager, pipeMap) {
    const childrenOf = new Map();
    manager.pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });

    // pipe.id → sayaç (bu boru sayaca giriyor), sayac.id → çıkış boru id'leri
    const sayacByInputPipe = new Map();
    const sayacOutputPipes = new Map();
    (manager.components || []).forEach(c => {
        if (c.type === 'sayac' && c.fleksBaglanti?.boruId) {
            sayacByInputPipe.set(c.fleksBaglanti.boruId, c);
        }
    });
    manager.pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'sayac' && bag.hedefId) {
            if (!sayacOutputPipes.has(bag.hedefId)) sayacOutputPipes.set(bag.hedefId, []);
            sayacOutputPipes.get(bag.hedefId).push(p.id);
        }
    });

    function hasRegOnP2(pipeId) {
        return (manager.components || []).some(c =>
            c.type === 'regulator' &&
            c.bagliBoruId === pipeId &&
            (c.boruPozisyonu || 0) >= 0.5
        );
    }

    (manager.components || []).forEach(reg => {
        if (reg.type !== 'regulator' || !reg.bagliBoruId) return;
        if ((reg.boruPozisyonu || 0) < 0.5) return; // sadece p2 ucundaki regülatörler aşağıya etki eder
        const cikis = Number(reg.cikisBasinc) || 21;

        const visited = new Set();
        const queue = [...(childrenOf.get(reg.bagliBoruId) || [])];

        while (queue.length > 0) {
            const pid = queue.shift();
            if (visited.has(pid)) continue;
            visited.add(pid);

            const pipe = pipeMap.get(pid);
            if (pipe) pipe.basinc = cikis;

            // Bu boru üzerinde kendi p2'sinde başka bir regülatör varsa daha aşağı inme;
            // o regülatörün kendi pass'i alt ağacı yönetir.
            if (hasRegOnP2(pid)) continue;

            (childrenOf.get(pid) || []).forEach(cid => queue.push(cid));

            // Boru sayacın giriş borusu ise sayaç üzerinden çıkış borularına geç
            const sayac = sayacByInputPipe.get(pid);
            if (sayac) {
                sayac.basinc = String(cikis);
                (sayacOutputPipes.get(sayac.id) || []).forEach(oid => queue.push(oid));
            }
        }
    });
}
