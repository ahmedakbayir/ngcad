// error-check-manager.js
// Hata kontrol mekanizmasının çekirdeği.
//
// Kullanım:
//   import { errorCheckManager } from './error-check-manager.js';
//   errorCheckManager.register((ctx) => [ { group, message, ... } ]);
//   const results = errorCheckManager.runAll();   // → grup grup hatalar
//   errorCheckManager.applyFix(errorId);
//   errorCheckManager.applyGroupFixes(groupId);
//
// Bir checker fonksiyonu şu imzaya sahiptir:
//   (ctx) => ErrorItem[]
//
// ctx şu an sadece { manager } içerir. İleride { manager, hatGroups, ... } gibi
// önceden hesaplanmış paylaşımlı veriler eklenebilir.
//
// Bir ErrorItem objesi:
//   {
//     group:      'BASINC_KAYIP',        // ERROR_GROUP_IDS sabitlerinden biri
//     errorId:    'pl-27-28',            // benzersiz id (kararlı olmalı)
//     message:    '27-28: 0.87 mbar (≤ 0.8 mbar olmalıdır)',
//     source:     'TS7363 Md:4.3.3',     // "Detay" popup'ında "Kaynak"
//     detail:     'Servis kutusu çıkışı 21 mbar tesisatta, ...',
//     targets:    [{ type:'pipe',  id:'...' },
//                  { type:'comp',  id:'...' },
//                  { type:'hat',   no: 7 },
//                  { type:'path',  hatNos:[1,2,3] }],
//     fix: {                              // null ise "çözüm öner" gizlenir
//        description: 'DN20 → DN25 yükseltilecek',
//        apply: () => boolean,            // true → uygulandı, listeden silinmeli
//     },
//   }

import { plumbingManager } from '../plumbing-manager.js';

class ErrorCheckManager {
    constructor() {
        this._checkers = [];           // { id, fn }
        this._lastResults = [];        // son runAll çıktısı
        this._listeners = new Set();   // ({type, payload}) => void
    }

    /**
     * Yeni bir checker fonksiyonu kaydeder.
     * @param {string} id - tanılayıcı / dedupe için
     * @param {(ctx:object)=>Array} fn - hata listesi döndürür
     */
    register(id, fn) {
        if (!id || typeof fn !== 'function') return;
        // Aynı id ile yeniden kayıt → üzerine yaz
        this._checkers = this._checkers.filter(c => c.id !== id);
        this._checkers.push({ id, fn });
    }

    unregister(id) {
        this._checkers = this._checkers.filter(c => c.id !== id);
    }

    /** Tüm checker'ları çalıştırır, sonuçları bellekte tutar ve döner. */
    runAll() {
        const ctx = this._buildContext();
        const all = [];
        for (const { id, fn } of this._checkers) {
            try {
                const out = fn(ctx) || [];
                if (Array.isArray(out)) all.push(...out);
            } catch (e) {
                console.error(`[ErrorCheck] checker "${id}" failed:`, e);
            }
        }
        this._lastResults = all.filter(Boolean);
        this._emit({ type: 'run', payload: { count: this._lastResults.length } });
        return this._lastResults.slice();
    }

    /** Son çalışmanın sonuçlarını döner (yeniden çalıştırmaz). */
    getResults() {
        return this._lastResults.slice();
    }

    /** Sonuçları gruplara ayırıp döner: { groupId: ErrorItem[] }. */
    getGroupedResults() {
        const groups = {};
        for (const item of this._lastResults) {
            const g = item.group || 'OTHER';
            if (!groups[g]) groups[g] = [];
            groups[g].push(item);
        }
        return groups;
    }

    /**
     * Verilen errorId için fix.apply() çağrılır. Başarılıysa listeden çıkarılır.
     * @returns {{ ok:boolean, message?:string }}
     */
    applyFix(errorId) {
        const item = this._lastResults.find(x => x.errorId === errorId);
        if (!item) return { ok: false, message: 'Hata bulunamadı' };
        if (!item.fix || typeof item.fix.apply !== 'function') {
            return { ok: false, message: 'Bu hata için çözüm tanımlı değil' };
        }
        let ok = false;
        try { ok = !!item.fix.apply(); }
        catch (e) { console.error('[ErrorCheck] fix.apply failed:', e); ok = false; }
        if (ok) {
            this._lastResults = this._lastResults.filter(x => x.errorId !== errorId);
            this._emit({ type: 'fix', payload: { errorId, group: item.group } });
        }
        return { ok, message: ok ? (item.fix.description || 'Uygulandı') : 'Uygulama başarısız' };
    }

    /**
     * Grubun altındaki çözülebilir hataları sırayla uygular.
     * @returns {{ applied:number, total:number }}
     */
    applyGroupFixes(groupId) {
        const items = this._lastResults
            .filter(x => x.group === groupId && x.fix && typeof x.fix.apply === 'function');
        const total = items.length;
        let applied = 0;
        for (const it of items) {
            try {
                if (it.fix.apply()) applied++;
            } catch (e) {
                console.error('[ErrorCheck] group fix failed:', e);
            }
        }
        if (applied > 0) {
            const fixedIds = new Set(items.slice(0, applied).map(x => x.errorId));
            // Toplu uyguladığımız için, applied sayısı kadar item'ı listeden çıkarırız.
            // Ancak güvenli yol: listeyi yeniden çalıştırmaktır. Bu işi UI yapacak.
            this._lastResults = this._lastResults.filter(x => !fixedIds.has(x.errorId));
            this._emit({ type: 'group-fix', payload: { groupId, applied, total } });
        }
        return { applied, total };
    }

    // ─── Dinleyiciler ───
    addListener(fn) { if (typeof fn === 'function') this._listeners.add(fn); }
    removeListener(fn) { this._listeners.delete(fn); }
    _emit(evt) { this._listeners.forEach(fn => { try { fn(evt); } catch (_) {} }); }

    // ─── İç yardımcılar ───
    _buildContext() {
        const manager =
            window.plumbingManager?.interactionManager?.manager ||
            window.plumbingManager ||
            plumbingManager;
        return { manager };
    }
}

export const errorCheckManager = new ErrorCheckManager();

if (typeof window !== 'undefined') {
    window.errorCheckManager = errorCheckManager;
}
