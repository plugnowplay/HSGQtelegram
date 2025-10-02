# Bot Telegram HSGQ OLT

Bot Telegram untuk OLT HSGQ - mendukung EPON dan GPON

Dibuat dengan Node.js

## Fitur Utama

- ✅ Kompatibel dengan OLT EPON dan GPON
- ✅ Menampilkan status OLT dan informasi sistem
- ✅ Menampilkan daftar port PON dan ONU
- ✅ Melihat detail ONU (status, power, jarak, model, dll)
- ✅ Melakukan reboot ONU dengan konfirmasi
- ✅ Mengubah nama ONU dengan konfirmasi
- ✅ Menampilkan semua ONU terdaftar
- ✅ Menampilkan ONU dengan redaman sinyal buruk
- ✅ Autentikasi pengguna untuk keamanan
- ✅ Mendukung pencarian dengan Serial Number, MAC Address, atau nama ONU
- ✅ Logging lengkap untuk keperluan debugging

## Instalasi

Unduh atau Clone dengan `download as zip` atau `git clone`:
```console
$ git clone https://github.com/plugnowplay/HSGQtelegram.git
```

Masuk ke direktori `HSGQtelegram`:
```console
$ cd HSGQtelegram
```

Lakukan perintah npm install, *harus terinstall node.js*:
```console
$ npm install
```

Copy .env-example menjadi .env:
```console
$ cp .env-example .env
```

Ubah variabel di `.env` agar sesuai dengan kebutuhan Anda:

```
BOT_TOKEN=token_telegram_bot_anda # Didapatkan dari @BotFather di Telegram
PASS_CHAT=password123 # Password untuk autentikasi pengguna
OLT_IP=192.168.1.1 # IP Address OLT
OLT_USERNAME=admin # Username login OLT
OLT_PASSWORD=admin # Password login OLT
OLT_TYPE=GPON # Tipe OLT (EPON atau GPON)
```

Pastikan Anda mengatur `OLT_TYPE` dengan benar sesuai dengan jenis OLT yang digunakan (EPON atau GPON).

Jalankan aplikasi dengan perintah:
```console
$ node app.js
```
atau
```console
$ npm start
```

## Perintah

Setelah aplikasi berjalan, buka aplikasi Telegram lalu ketik perintah:
```console
/start
```
jika berhasil maka akan muncul balasan `Selamat Datang` namun jika muncul balasan
`anda belum terdaftar` atau `Maaf Anda bukan anggota`, Anda harus menginisialisasi terlebih dahulu

Untuk Inisialisasi, ketik perintah:
```console
/password
```
Setelah itu akan muncul permintaan masukkan kata sandi dan jawab dengan kata sandi
yang telah Anda masukkan di file `.env` pada bagian `PASS_CHAT`.
Jika berhasil maka akan muncul balasan `Authentikasi Berhasil`.

Atau bisa dipersingkan dengan :
```console
/password {password yang ada di .ENV}
```
contoh `/password 12345678`

Perintah untuk menampilkan info port dan onu:
```console
/pon
```

Perintah untuk menampilkan detail ONU:
```console
/onu {parameter}
```

* untuk {parameter} bisa diisi dengan Alamat MAC (EPON) / Serial Number (GPON) / Nama ONU contoh:

    * GPON dengan Serial Number:
        ```console
        /onu HWTC0843129e
        ```

    * EPON dengan alamat MAC:
        ```console
        /onu 00:1B:44:11:3A:B7
        ```

    * nama ONU:
        ```console
        /onu modem-budi
        ```

**Catatan**: Anda juga dapat langsung mengetikkan Serial Number, MAC Address, atau nama ONU tanpa perintah `/onu` di depannya, dan bot akan mencoba mencari ONU tersebut.

Perintah untuk menampilkan informasi sistem OLT (vendor, model, tipe, firmware, MAC, SN, jumlah port PON):
```console
/olt
```

Perintah untuk melakukan reboot ONU:
```console
/reboot {parameter}
```

* untuk {parameter} bisa diisi dengan Alamat MAC (EPON) / Serial Number (GPON) / Nama ONU contoh:

    * GPON dengan Serial Number:
        ```console
        /reboot HWTC0843129e
        ```

    * EPON dengan alamat MAC:
        ```console
        /reboot 00:1B:44:11:3A:B7
        ```

    * nama ONU:
        ```console
        /reboot modem-budi
        ```

**Catatan**: Perintah reboot akan meminta konfirmasi sebelum dijalankan untuk keamanan.

Perintah untuk mengubah nama ONU:
```console
/rename {parameter} {nama-baru}
```

* untuk {parameter} bisa diisi dengan Alamat MAC (EPON) / Serial Number (GPON) / Nama ONU contoh:

    * GPON dengan Serial Number:
        ```console
        /rename HWTC0843129e PELANGGAN-BARU
        ```

    * EPON dengan alamat MAC:
        ```console
        /rename 00:1B:44:11:3A:B7 PELANGGAN-BARU
        ```

    * nama ONU lama:
        ```console
        /rename modem-budi PELANGGAN-BARU
        ```

**Catatan**: Perintah rename akan meminta konfirmasi sebelum dijalankan dan akan otomatis melakukan save konfigurasi.

Perintah untuk menampilkan semua ONU:
```console
/showall
```

**Catatan**: Perintah ini akan mengirimkan daftar ONU satu per satu secara terpisah dengan format: `[Status Emoji] [SN/MAC] [Nama ONU]`.

Perintah untuk menampilkan ONU dengan redaman sinyal buruk:
```console
/cek
```

**Catatan**: Perintah ini akan menampilkan daftar ONU yang memiliki redaman sinyal di bawah -25 dBm, diurutkan dari yang terburuk.

Perintah untuk menghapus akses pengguna dari bot:
```console
/delete {telegram-id}
```

**Catatan**: Perintah ini memerlukan ID Telegram pengguna yang ingin dihapus aksesnya.

## Status ONU

Bot menampilkan status ONU dengan emoji berikut:

- ✅ : ONU online/aktif
- ❌ : ONU offline/nonaktif
- ⚠️ : ONU dalam status warning
- 📉 : ONU dengan redaman sinyal buruk (di bawah -25 dBm)

## Untuk Docker / Kontainer

Unduh atau Clone dengan `download as zip` atau `git clone`:
```console
$ git clone https://github.com/plugnowplay/HSGQtelegram.git
```

Masuk ke direktori `bot-HSGQ`:
```console
$ cd HSGQtelegram
```

Copy .env-example menjadi .env:
```console
$ cp .env-example .env
```
Ubah variabel di `.env` agar sesuai dengan alamat IP, nama pengguna, dan kata sandi OLT Anda.

Buat image aplikasi dengan perintah:
```console
$ docker build -t hsgq-telegram-bot .
```

Jalankan kontainer dengan perintah:
```console
$ docker run -d --name hsgq-bot --restart unless-stopped hsgq-telegram-bot
```

Untuk melihat log:
```console
$ docker logs -f hsgq-bot
```

## Logging dan Troubleshooting

Bot ini dilengkapi dengan fitur logging komprehensif yang membantu dalam proses debugging. Semua proses utama dicatat dengan format:

```
[namaFungsi] Pesan log: detail
```

Contoh log yang akan muncul:
```
[rebootOnu] Memulai proses reboot untuk ONU: modem-123
[rebootOnu] GPON: Jumlah ONU ditemukan: 32
[rebootOnu] GPON: ONU ditemukan: {"name":"modem-123","sn":"HWTC1234567","identifier":"0/1/1"}
[rebootOnu] GPON: Melakukan reboot untuk ONU dengan identifier: 0/1/1
[rebootOnu] GPON: Response reboot: {"message":"Success","code":1,"data":{}}
[rebootOnu] GPON: Reboot berhasil - modem-123
```

Jika Anda mengalami masalah, periksa log untuk informasi lebih detail tentang apa yang terjadi.

