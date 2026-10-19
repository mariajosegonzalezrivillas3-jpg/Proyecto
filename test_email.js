require('dotenv').config();
const { sendResetCodeEmail } = require('./services/emailService');

async function testGmail() {
  const targetEmail = process.argv[2] || process.env.GMAIL_USER || 'test@gmail.com';

  console.log('====================================================');
  console.log('🧪 PRUEBA DE ENVÍO DE CORREO SALIENTE (GMAIL / SMTP)');
  console.log('====================================================');
  console.log(`- Remitente configurado: ${process.env.GMAIL_USER || process.env.SMTP_USER || 'No configurado en .env'}`);
  console.log(`- Contraseña de aplicación: ${process.env.GMAIL_APP_PASS ? '******** (Configurada)' : 'No configurada'}`);
  console.log(`- Correo de destino para prueba: ${targetEmail}`);
  console.log('----------------------------------------------------');

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) {
    console.log('⚠️ AVISO: Aún no has configurado GMAIL_USER y GMAIL_APP_PASS en el archivo .env.');
    console.log('   Por favor añade tus credenciales al archivo .env para enviar correos a buzones reales:');
    console.log('   GMAIL_USER=tu_correo@gmail.com');
    console.log('   GMAIL_APP_PASS=tu_clave_de_16_letras\n');
  }

  try {
    const testCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`Enviando código de prueba [${testCode}] a ${targetEmail}...`);
    const result = await sendResetCodeEmail(targetEmail, testCode, 'Usuario de Prueba');
    console.log('\n✅ ¡CORREO ENVIADO EXITOSAMENTE!');
    console.log(`- ID de mensaje: ${result.messageId}`);
    if (result.previewUrl) {
      console.log(`- URL de vista previa: ${result.previewUrl}`);
    }
  } catch (err) {
    console.error('\n❌ ERROR AL ENVIAR CORREO:', err.message);
  }
}

testGmail();
