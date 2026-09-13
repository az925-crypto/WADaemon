package com.zaaaam.wadaemon

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

/**
 * PLACEHOLDER M0 — hanya agar pipeline release terbukti hijau.
 * UI asli (layar pairing, kode 8-digit, indikator status) mengikuti
 * mockup HTML di mockup/ yang wajib di-approve via Telegram dulu.
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val view = TextView(this)
        view.text = "WADaemon M0 — pipeline skeleton"
        setContentView(view)
    }
}
