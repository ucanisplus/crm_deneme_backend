// Vercel Serverless Function - E-posta gönderme fonksiyonu
// API anahtarlarınızı Vercel sunucularında güvenli tutar

export default async function handler(req, res) {
  // CORS'u etkinleştir
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight isteklerini işle
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Sadece POST isteklerine izin ver
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requestData, requestId } = req.body;

    // API anahtarını çevre değişkeninden al (Vercel dashboard'da ayarlanır)
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      // Hatayı frontend'e gösterme
      return res.status(200).json({
        success: true,
        message: 'Email request received (configuration pending)'
      });
    }

    // E-posta HTML formatını hazırla
    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header with Logo -->
        <div style="background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%); padding: 40px 30px; text-align: center; border-bottom: 4px solid #dc3545;">
          <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHRbZuBJGKNr0tNqoahRylJW_ybbltProcCw&s" 
               alt="ALBAYRAK DEMİR ÇELİK" 
               style="max-height: 100px; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto;">
          <h1 style="color: #1a1a1a; margin: 0; font-size: 32px; font-weight: 300; letter-spacing: 1px;">ALBAYRAK DEMİR ÇELİK</h1>
          <p style="color: #666; margin: 8px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">CRM SİSTEMİ</p>
        </div>
        
        <!-- Main Content -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #dc3545; font-size: 24px; font-weight: 400; margin: 0 0 35px 0; padding-bottom: 15px; border-bottom: 1px solid #e0e0e0;">
            Yeni Galvanizli Tel Talebi
          </h2>
          
          <!-- Request Info -->
          <div style="background-color: #fafafa; padding: 20px; border-left: 4px solid #dc3545; margin-bottom: 30px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; width: 140px;">Talep Numarası:</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600; font-size: 14px;">${requestId || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Talep Tarihi:</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px;">${new Date().toLocaleString('tr-TR')}</td>
              </tr>
            </table>
          </div>
          
          <!-- Product Details Table -->
          <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333; width: 40%;">Çap</td>
              <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #dc3545; font-weight: 600;">${requestData?.cap || 'N/A'} mm</td>
            </tr>
            <tr>
              <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333;">Miktar</td>
              <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #dc3545; font-weight: 600;">${requestData?.kg || 'N/A'} kg</td>
            </tr>
            <tr>
              <td style="background-color: #f8f9fa; padding: 14px 20px; font-weight: 500; color: #333;">Kaplama</td>
              <td style="background-color: #fff; padding: 14px 20px; color: #1a1a1a;">${requestData?.kaplama || 'N/A'} g/m²</td>
            </tr>
          </table>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 25px 30px; border-top: 1px solid #e0e0e0; text-align: center;">
          <p style="margin: 0; color: #999; font-size: 12px;">
            Bu e-posta ALB CRM sistemi tarafından otomatik olarak gönderilmiştir.
          </p>
        </div>
      </div>
    `;

    // Resend API kullanarak e-posta gönder
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ALB CRM <onboarding@resend.dev>',
        to: ['albcrm01@gmail.com'],
        subject: `Yeni Galvanizli Tel Talebi - ${requestId || new Date().getTime()}`,
        html: emailHtml
      })
    });

    const result = await response.json();
    
    console.log('Email sent:', result);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully',
      emailId: result.id 
    });

  } catch (error) {
    console.error('Email error:', error);
    // Ana akışı bozma
    return res.status(200).json({
      success: true,
      message: 'Email request processed'
    });
  }
}