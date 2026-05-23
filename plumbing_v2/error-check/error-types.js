// error-types.js
// Hata kontrol mekanizmasının grup tanımları.
// "Hata metni özeti" sütunundaki başlıklar burada sabitlenir.
// Her grup için id (machine-readable) + label (UI) + opsiyonel sıralama önceliği.
//
// Yeni grup eklemek: aşağıya bir GROUPS girişi + ERROR_GROUP_IDS'e id ekle.

export const ERROR_GROUP_IDS = Object.freeze({
    BASINC_KAYIP:          'BASINC_KAYIP',
    TESISAT_HIZ:           'TESISAT_HIZ',
    MUHAFAZA:              'MUHAFAZA',
    TESISAT_NESNESI_EKSIK: 'TESISAT_NESNESI_EKSIK',
    TASARIM:               'TASARIM',
    SAYAC_HATA:            'SAYAC_HATA',
    MAHAL_TANIM:           'MAHAL_TANIM',
});

export const ERROR_GROUPS = Object.freeze({
    [ERROR_GROUP_IDS.BASINC_KAYIP]: {
        id:    ERROR_GROUP_IDS.BASINC_KAYIP,
        label: 'Basınç Kayıp Hatası',
        order: 10,
    },
    [ERROR_GROUP_IDS.TESISAT_HIZ]: {
        id:    ERROR_GROUP_IDS.TESISAT_HIZ,
        label: 'Boru Hız Hatası',
        order: 20,
    },
    [ERROR_GROUP_IDS.MUHAFAZA]: {
        id:    ERROR_GROUP_IDS.MUHAFAZA,
        label: 'Muhafaza Hatası',
        order: 40,
    },
    [ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK]: {
        id:    ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
        label: 'Tesisat nesnesi eksik',
        order: 50,
    },
    [ERROR_GROUP_IDS.TASARIM]: {
        id:    ERROR_GROUP_IDS.TASARIM,
        label: 'Tasarım Hatası',
        order: 60,
    },
    [ERROR_GROUP_IDS.SAYAC_HATA]: {
        id:    ERROR_GROUP_IDS.SAYAC_HATA,
        label: 'Sayaç Hatası',
        order: 70,
    },
    [ERROR_GROUP_IDS.MAHAL_TANIM]: {
        id:    ERROR_GROUP_IDS.MAHAL_TANIM,
        label: 'Mahal Tanım Hatası',
        order: 80,
    },
});

export function getGroupLabel(groupId) {
    return ERROR_GROUPS[groupId]?.label || groupId || '(Bilinmeyen Grup)';
}

export function getGroupOrder(groupId) {
    return ERROR_GROUPS[groupId]?.order ?? 999;
}
