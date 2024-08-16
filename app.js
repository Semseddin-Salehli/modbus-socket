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
    return client.connectTCP("YOUR MODBUS IP ADDRESS", { port: 502 })
        .then(() => {
            client.setID(1);
            return client.readHoldingRegisters(0, 9);
        })
        .then((data) => {
            return data.data;
        })
        .catch((err) => {
            console.error("Modbus hatası:", err);
            return null;
        })
        .finally(() => {
            client.close();
        });
}

wss.on('connection', (ws) => {
    console.log('Yeni bir WebSocket istemcisi bağlandı.');

    const interval = setInterval(async () => {
        const modbusData = await getModbusData();
        if (modbusData) {
            ws.send(JSON.stringify({
                data: modbusData,
                timestamp: new Date().toISOString()
            }));
        }
    }, 5000);

    ws.on('close', () => {
        clearInterval(interval);
    });
});

app.get('/datas', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Modbus Verisi</title>
            </head>
            <body>
                <h1>Modbus Verisi</h1>
                <p id="data">Veri yükleniyor...</p>
                <script>
                    const ws = new WebSocket('ws://' + window.location.host);
                    
                    ws.onmessage = function(event) {
                        const message = JSON.parse(event.data);
                        document.getElementById('data').textContent = 
                            'Veri: ' + message.data.join(', ') + 
                            '\\nTimestamp: ' + message.timestamp;
                    };
                </script>
            </body>
        </html>
    `);
});

server.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});
