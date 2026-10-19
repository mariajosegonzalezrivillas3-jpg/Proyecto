const nodemailer = require('nodemailer');

let transporter = null;
let etherealAccount = null;

/**
 * Obtener o inicializar el transportador de correo electrónico
 */
async function getTransporter() {
  if (transporter) return transporter;

  // 1. Configuración personalizada de SMTP o Gmail desde variables de entorno
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log(`📧 Configurando transportador SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    return transporter;
  }

  if (process.env.GMAIL_USER) {
    const cleanUser = process.env.GMAIL_USER.trim();
    const rawPass = process.env.GMAIL_APP_PASS ? process.env.GMAIL_APP_PASS.trim() : '';

    if (!rawPass) {
      throw new Error(`Se ha configurado el remitente ${cleanUser}, pero falta la contraseña de aplicación de 16 letras en GMAIL_APP_PASS en el archivo .env.`);
    }

    const cleanPass = rawPass.replace(/\s+/g, '');
    console.log(`📧 Configurando transportador Gmail con cuenta oficial: ${cleanUser}`);
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: cleanUser,
        pass: cleanPass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: false
      }
    });
    return transporter;
  }

  // 2. Modo Entorno de Pruebas / Desarrollo con Ethereal (Servicio SMTP de prueba)
  try {
    console.log('📧 Creando cuenta SMTP de prueba con Ethereal Mail para despacho de correos...');
    etherealAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: etherealAccount.smtp.host,
      port: etherealAccount.smtp.port,
      secure: etherealAccount.smtp.secure,
      auth: {
        user: etherealAccount.user,
        pass: etherealAccount.pass
      }
    });
    console.log(`✅ Transportador SMTP Ethereal listo (${etherealAccount.user})`);
    return transporter;
  } catch (err) {
    console.warn('⚠️ No se pudo inicializar Ethereal Mail, usando transportador JSON simulado:', err.message);
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
    return transporter;
  }
}

/**
 * Enviar código de recuperación de contraseña por correo electrónico
 * @param {string} toEmail Correo del destinatario
 * @param {string} code Código de verificación de 6 dígitos
 * @param {string} userName Nombre del usuario (opcional)
 */
async function sendResetCodeEmail(toEmail, code, userName = '') {
  try {
    const mailer = await getTransporter();
    const defaultSender = process.env.GMAIL_USER ? process.env.GMAIL_USER.trim() : 'calendariolcgs@gmail.com';
    const fromAddress = process.env.SMTP_FROM || `"I.E. Luis Carlos Galán Sarmiento" <${defaultSender}>`;
    const recipientName = userName ? ` ${userName}` : '';

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #ffffff; padding: 26px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -0.3px; }
        .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.95; font-weight: 500; }
        .content { padding: 30px 24px; text-align: center; }
        .greeting { font-size: 16px; color: #334155; margin-bottom: 16px; text-align: left; }
        .instructions { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; text-align: left; }
        .code-box { background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 10px; padding: 18px 12px; margin: 20px 0; text-align: center; }
        .code-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #1d4ed8; font-weight: 700; margin-bottom: 6px; }
        .code-number { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1e40af; font-family: 'Courier New', Courier, monospace; margin: 0; }
        .expiration { font-size: 12px; color: #64748b; margin-top: 8px; font-weight: 500; }
        .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 24px 0 16px; font-size: 13px; color: #92400e; text-align: left; border-radius: 0 8px 8px 0; }
        .footer { background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏛️ I.E. Luis Carlos Galán Sarmiento</h1>
          <p>Portal Institucional de Calendarios y Horarios</p>
        </div>
        <div class="content">
          <div class="greeting">Estimado(a)${recipientName},</div>
          <p class="instructions">
            Hemos recibido una solicitud para restablecer la contraseña de acceso a tu cuenta institucional en la <strong>I.E. Luis Carlos Galán Sarmiento</strong>.
            Usa el siguiente código de verificación de 6 dígitos para confirmar tu identidad:
          </p>
          <div class="code-box">
            <div class="code-title">Código de Seguridad</div>
            <p class="code-number">${code}</p>
            <div class="expiration">⏳ Válido por 15 minutos</div>
          </div>
          <div class="warning">
            <strong>🔒 Medida de Seguridad:</strong> Si tú no solicitaste este código, puedes desestimar este mensaje. Tu contraseña actual no será modificada.
          </div>
        </div>
        <div class="footer">
          Mensaje de seguridad institucional generado automáticamente por el Portal LCGS (${defaultSender}). Por favor no responder a este correo.
        </div>
      </div>
    </body>
    </html>
    `;

    const mailOptions = {
      from: fromAddress,
      to: toEmail,
      subject: `🔐 ${code} es tu código de verificación institucional - I.E. Luis Carlos Galán Sarmiento`,
      text: `Hola${recipientName},\n\nTu código de verificación para restablecer tu contraseña en la I.E. Luis Carlos Galán Sarmiento es: ${code}\n\nEste código es válido por 15 minutos.\n\nSi no realizaste esta solicitud, puedes ignorar este mensaje.\n\nAtentamente,\nPortal Institucional LCGS`,
      html: htmlContent
    };

    const info = await mailer.sendMail(mailOptions);
    console.log(`📨 Correo de recuperación despachado a ${toEmail}. ID: ${info.messageId}`);

    // Si fue enviado por Ethereal, mostrar URL de vista previa web del correo
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`🌐 [VISTA PREVIA DE CORREO DISPONIBLE]: ${previewUrl}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || null
    };
  } catch (error) {
    console.error('❌ Error enviando correo de recuperación:', error);
    throw new Error('No se pudo enviar el correo de recuperación. Verifique la configuración del servidor de correo.');
  }
}

module.exports = {
  sendResetCodeEmail
};
