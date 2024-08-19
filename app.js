const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const ModbusRTU = require('modbus-serial');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const port = 3000;

const client = new ModbusRTU();

function getModbusData() {
    return client.connectTCP("10.0.10.11", { port: 502 })
        .then(() => {
            client.setID(1);
            return client.readHoldingRegisters(0, 10); // 10 register oku (5 float değer)
        })
        .then((data) => {
            const floats = [];
            for (let i = 0; i < data.data.length; i += 2) {
                const floatVal = registersToFloat(data.data[i], data.data[i + 1]);
                floats.push(floatVal);
            }
            return floats;
        })
        .catch((err) => {
            console.error("Modbus hatası:", err);
            return null;
        })
        .finally(() => {
            client.close();
        });
}

function registersToFloat(register1, register2) {
    const buffer = new ArrayBuffer(4); // 4 byte (32-bit) buffer oluştur
    const view = new DataView(buffer);

    // Modbus'tan gelen verilerin byte sıralaması (endianness) önemlidir.
    // Burada Big-Endian olduğunu varsayıyoruz.
    view.setUint16(0, register1, true); // İlk 16-bit'i yerleştir (Big-Endian)
    view.setUint16(2, register2, true); // İkinci 16-bit'i yerleştir (Big-Endian)

    return view.getFloat32(0, true); // 32-bit float değeri olarak oku (Big-Endian)
}

// Alarm türünü ve mesajını belirleyen fonksiyon
function checkForAlarms(data) {
    const alarms = [];

    for (let i = 0; i < data.length; i++) {
        let alarmType = 'normal'; // Default olarak normal
        let alarmMessage = 'Her şey normal'; // Default alarm mesajı

        if (data[i] >= 39999) {
            alarmType = 'error'; // Hata durumu
            alarmMessage = 'Kritik hata! Değer çok yüksek!';
        } else if (data[i] > 100) {
            alarmType = 'warning'; // Uyarı durumu
            alarmMessage = 'Dikkat! Değer yüksek!';
        }

        alarms.push({ index: i, value: data[i], type: alarmType, message: alarmMessage });
    }

    return alarms;
}

wss.on('connection', (ws) => {
    console.log('Yeni bir WebSocket istemcisi bağlandı.');

    const interval = setInterval(async () => {
        const modbusData = await getModbusData();
        if (modbusData) {
            const alarms = checkForAlarms(modbusData);

            ws.send(JSON.stringify({
                data: modbusData,
                timestamp: new Date().toISOString(),
                alarms: alarms
            }));
        }
    }, 1000);

    ws.on('close', () => {
        clearInterval(interval);
    });
});

app.get('/datas', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Modbus Verisi</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background-color: #f4f4f4;
                        margin: 0;
                        padding: 20px 50px 20px 50px;
                        height: auto;
                    }
                    h1 {
                        text-align: center;
                        margin-bottom: 20px;
                    }
                    table {
                        min-width: 80%;
                        border-collapse: collapse;
                        margin: 25px auto;
                        font-size: 18px;
                        box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);
                    }
                    table thead tr {
                        background-color: #009879;
                        color: #ffffff;
                        text-align: left;
                        font-weight: bold;
                    }
                    table th, table td {
                        padding: 12px 15px;
                        text-align: center;
                    }
                    table tbody tr {
                        border-bottom: 1px solid #dddddd;
                    }
                    table tbody tr:nth-of-type(even) {
                        background-color: #f3f3f3;
                    }
                    table tbody tr:last-of-type {
                        border-bottom: 2px solid #009879;
                    }

                    /* Alarm türlerine göre satır renkleri */
                    table tbody tr.warning {
                        background-color: #f39c12; /* Uyarı için sarı tonları */
                        color: #ffffff;
                    }

                    table tbody tr.error {
                        background-color: #e74c3c; /* Hata için kırmızı tonları */
                        color: #ffffff;
                    }

                    table tbody tr.normal {
                        background-color: #ecf0f1; /* Normal için beyaz tonları */
                        color: #2c3e50;
                    }
                </style>
            </head>
            <body>
                <div>
                    <h1>Modbus Verisi</h1>
                    <table>
                        <thead>
                            <tr>
                                <th>Index</th>
                                <th>Değer</th>
                                <th>Alarm Durumu</th>
                                <th>Alarm Mesajı</th>
                            </tr>
                        </thead>
                        <tbody id="data-table">
                            <tr>
                                <td colspan="4">Veri yükleniyor...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <script>
                    const ws = new WebSocket('ws://' + window.location.host);

                    ws.onmessage = function(event) {
                        const message = JSON.parse(event.data);
                        const tableBody = document.getElementById('data-table');
                        tableBody.innerHTML = '';

                        message.alarms.forEach((alarm) => {
                            const row = document.createElement('tr');
                            const cellIndex = document.createElement('td');
                            const cellValue = document.createElement('td');
                            const cellAlarm = document.createElement('td');
                            const cellMessage = document.createElement('td');

                            cellIndex.textContent = alarm.index;
                            cellValue.textContent = alarm.value;
                            cellAlarm.textContent = alarm.type.toUpperCase();
                            cellMessage.textContent = alarm.message;

                            row.classList.add(alarm.type); // Alarm tipine göre sınıf ekle

                            row.appendChild(cellIndex);
                            row.appendChild(cellValue);
                            row.appendChild(cellAlarm);
                            row.appendChild(cellMessage);
                            tableBody.appendChild(row);
                        });
                    };
                </script>
            </body>
        </html>
    `);
});

server.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});
