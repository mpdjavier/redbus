const axios = require('axios');

async function run() {
    try {
        const res = await axios.get('http://localhost:3000/api/lines');
        const lines = res.data;
        const target = lines.filter(l =>
            (l.descripcion && (l.descripcion.includes('118') || l.descripcion.toUpperCase().includes('RINCONADA'))) ||
            l.codLinea == 118 || l.codLinea == 100
        );
        console.log("Total lines:", lines.length);
        console.log(JSON.stringify(target, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

run();
