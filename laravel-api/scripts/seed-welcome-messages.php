<?php

/**
 * Seed welcome messages for all active groups.
 * Run with: php artisan tinker scripts/seed-welcome-messages.php
 * Or: docker exec wc-app php artisan tinker scripts/seed-welcome-messages.php
 */

$messages = [
    'chatter' => [
        'fr' => "Bienvenue dans la team ! 🎉\n\nTu es ici pour gagner de l'argent en partageant SOS-Expat. C'est simple :\n\n👉 Partage ton lien perso\n👉 Gagne 10$ par appel généré\n\nDes astuces arrivent bientôt ici. Stay tuned ! 💪",
        'en' => "Welcome to the team! 🎉\n\nYou're here to earn money by sharing SOS-Expat. It's simple:\n\n👉 Share your personal link\n👉 Earn \$10 per call generated\n\nTips and tricks coming soon. Stay tuned! 💪",
    ],
    'client' => [
        'fr' => "Bienvenue ! 👋\n\nVous avez besoin d'aide juridique ou administrative à l'étranger ? Vous êtes au bon endroit !\n\n📞 Appelez un avocat ou un expert en 2 clics sur SOS-Expat\n💰 1er appel offert avec le code de votre parrain\n\nN'hésitez pas à poser vos questions ici ! 🙏",
        'en' => "Welcome! 👋\n\nNeed legal or administrative help abroad? You're in the right place!\n\n📞 Call a lawyer or expert in 2 clicks on SOS-Expat\n💰 First call free with your referral code\n\nFeel free to ask questions here! 🙏",
        'de' => "Willkommen! 👋\n\nBrauchen Sie rechtliche Hilfe im Ausland? Sie sind hier richtig!\n\n📞 Rufen Sie einen Anwalt in 2 Klicks auf SOS-Expat an\n💰 Erstanruf kostenlos mit Ihrem Empfehlungscode\n\nFragen Sie gerne hier! 🙏",
        'pt' => "Bem-vindo! 👋\n\nPrecisa de ajuda jurídica no exterior? Você está no lugar certo!\n\n📞 Ligue para um advogado em 2 cliques no SOS-Expat\n💰 Primeira chamada grátis com o código do seu padrinho\n\nPergunte aqui! 🙏",
        'es' => "¡Bienvenido! 👋\n\n¿Necesitas ayuda legal en el extranjero? ¡Estás en el lugar correcto!\n\n📞 Llama a un abogado en 2 clics en SOS-Expat\n💰 Primera llamada gratis con tu código de referido\n\n¡Pregunta aquí! 🙏",
        'ar' => "أهلاً وسهلاً! 👋\n\nهل تحتاج مساعدة قانونية في الخارج؟ أنت في المكان الصحيح!\n\n📞 اتصل بمحامي بنقرتين على SOS-Expat\n💰 أول مكالمة مجانية برمز الإحالة\n\nلا تتردد في طرح أسئلتك هنا! 🙏",
        'zh' => "欢迎！👋\n\n在海外需要法律帮助？您来对地方了！\n\n📞 在SOS-Expat上2次点击联系律师\n💰 使用推荐码首次通话免费\n\n请随时提问！🙏",
        'hi' => "स्वागत है! 👋\n\nविदेश में कानूनी मदद चाहिए? आप सही जगह हैं!\n\n📞 SOS-Expat पर 2 क्लिक में वकील से बात करें\n💰 रेफरल कोड से पहली कॉल मुफ्त\n\nयहाँ पूछें! 🙏",
        'ru' => "Добро пожаловать! 👋\n\nНужна юридическая помощь за границей? Вы в правильном месте!\n\n📞 Позвоните адвокату в 2 клика на SOS-Expat\n💰 Первый звонок бесплатно по коду реферала\n\nЗадавайте вопросы здесь! 🙏",
    ],
    'avocat' => [
        'fr' => "Bienvenue parmi les avocats SOS-Expat ! ⚖️\n\nVous recevrez ici des appels de clients expatriés ayant besoin d'aide juridique.\n\n📱 Restez disponible\n💰 Vous êtes payé pour chaque consultation\n\nBonne continuation ! 🙌",
        'en' => "Welcome to SOS-Expat lawyers! ⚖️\n\nYou'll receive calls from expat clients needing legal help.\n\n📱 Stay available\n💰 You get paid for every consultation\n\nGood luck! 🙌",
        'de' => "Willkommen bei SOS-Expat Anwälte! ⚖️\n\nSie erhalten Anrufe von Expat-Klienten die rechtliche Hilfe benötigen.\n\n📱 Bleiben Sie erreichbar\n💰 Bezahlung pro Beratung\n\nViel Erfolg! 🙌",
        'pt' => "Bem-vindo aos advogados SOS-Expat! ⚖️\n\nVocê receberá chamadas de clientes expatriados.\n\n📱 Fique disponível\n💰 Pagamento por consulta\n\nBoa sorte! 🙌",
        'es' => "¡Bienvenido a abogados SOS-Expat! ⚖️\n\nRecibirás llamadas de clientes expatriados.\n\n📱 Mantente disponible\n💰 Cobras por cada consulta\n\n¡Buena suerte! 🙌",
        'ar' => "أهلاً بك في محامي SOS-Expat! ⚖️\n\nستتلقى مكالمات من عملاء مغتربين يحتاجون مساعدة قانونية.\n\n📱 ابق متاحاً\n💰 تحصل على أجر لكل استشارة\n\nبالتوفيق! 🙌",
        'zh' => "欢迎加入SOS-Expat律师团队！⚖️\n\n您将接到海外客户的法律咨询电话。\n\n📱 保持在线\n💰 每次咨询都有报酬\n\n祝好运！🙌",
        'hi' => "SOS-Expat वकीलों में स्वागत है! ⚖️\n\nआपको प्रवासी ग्राहकों से कॉल आएंगे।\n\n📱 उपलब्ध रहें\n💰 हर परामर्श के लिए भुगतान\n\nशुभकामनाएं! 🙌",
        'ru' => "Добро пожаловать в команду адвокатов SOS-Expat! ⚖️\n\nВы будете получать звонки от клиентов-экспатов.\n\n📱 Оставайтесь на связи\n💰 Оплата за каждую консультацию\n\nУдачи! 🙌",
    ],
    'blogger' => [
        'fr' => "Bienvenue dans le programme Bloggers ! ✍️\n\nGagne de l'argent en intégrant SOS-Expat sur ton blog ou site web.\n\n🔗 Ajoute notre widget sur ton site\n💰 10\$ par appel via ton lien + 5\$ par prestataire recruté\n\nLes ressources arrivent bientôt ! 🚀",
        'en' => "Welcome to the Bloggers program! ✍️\n\nEarn money by integrating SOS-Expat on your blog or website.\n\n🔗 Add our widget to your site\n💰 \$10 per call + \$5 per recruited provider\n\nResources coming soon! 🚀",
        'de' => "Willkommen im Blogger-Programm! ✍️\n\nVerdienen Sie Geld mit SOS-Expat auf Ihrem Blog.\n\n🔗 Widget einbinden\n💰 10\$ pro Anruf + 5\$ pro Vermittlung\n\nRessourcen kommen bald! 🚀",
        'pt' => "Bem-vindo ao programa Bloggers! ✍️\n\nGanhe dinheiro integrando o SOS-Expat no seu blog.\n\n🔗 Adicione nosso widget\n💰 \$10 por chamada + \$5 por prestador recrutado\n\nRecursos em breve! 🚀",
        'es' => "¡Bienvenido al programa Bloggers! ✍️\n\nGana dinero integrando SOS-Expat en tu blog.\n\n🔗 Añade nuestro widget\n💰 \$10 por llamada + \$5 por proveedor reclutado\n\n¡Recursos pronto! 🚀",
        'ar' => "مرحباً في برنامج المدونين! ✍️\n\nاكسب المال عبر دمج SOS-Expat في مدونتك.\n\n🔗 أضف الأداة لموقعك\n💰 10\$ لكل مكالمة + 5\$ لكل مقدم خدمة\n\nالموارد قادمة قريباً! 🚀",
        'zh' => "欢迎加入博客计划！✍️\n\n在您的博客上集成SOS-Expat来赚钱。\n\n🔗 添加我们的小工具\n💰 每次通话10\$ + 每位招募5\$\n\n资源即将到来！🚀",
        'hi' => "ब्लॉगर प्रोग्राम में स्वागत है! ✍️\n\nSOS-Expat को अपने ब्लॉग पर जोड़कर कमाएं।\n\n🔗 हमारा विजेट जोड़ें\n💰 \$10 प्रति कॉल + \$5 प्रति भर्ती\n\nसंसाधन जल्द! 🚀",
        'ru' => "Добро пожаловать в программу блогеров! ✍️\n\nЗарабатывайте, интегрируя SOS-Expat на своем блоге.\n\n🔗 Добавьте виджет\n💰 10\$ за звонок + 5\$ за привлечение\n\nРесурсы скоро! 🚀",
    ],
    'influencer' => [
        'fr' => "Bienvenue chez les Influencers SOS-Expat ! ⭐\n\nTu as une audience ? Monétise-la avec nous !\n\n📢 Partage ton lien perso sur tes réseaux\n💰 10\$ par appel + 5\$ par prestataire recruté\n📊 Dashboard pour suivre tes gains\n\nLet's go ! 🔥",
        'en' => "Welcome to SOS-Expat Influencers! ⭐\n\nGot an audience? Monetize it with us!\n\n📢 Share your personal link on your channels\n💰 \$10 per call + \$5 per recruited provider\n📊 Dashboard to track your earnings\n\nLet's go! 🔥",
        'de' => "Willkommen bei SOS-Expat Influencers! ⭐\n\nSie haben ein Publikum? Monetarisieren Sie es!\n\n📢 Teilen Sie Ihren Link\n💰 10\$ pro Anruf + 5\$ pro Vermittlung\n📊 Dashboard für Ihre Einnahmen\n\nLos geht's! 🔥",
        'pt' => "Bem-vindo aos Influencers SOS-Expat! ⭐\n\nTem audiência? Monetize conosco!\n\n📢 Compartilhe seu link\n💰 \$10 por chamada + \$5 por recrutamento\n📊 Dashboard de ganhos\n\nVamos lá! 🔥",
        'es' => "¡Bienvenido a Influencers SOS-Expat! ⭐\n\n¿Tienes audiencia? ¡Monetízala!\n\n📢 Comparte tu enlace personal\n💰 \$10 por llamada + \$5 por reclutamiento\n📊 Dashboard de ganancias\n\n¡Vamos! 🔥",
        'ar' => "مرحباً في مؤثري SOS-Expat! ⭐\n\nلديك جمهور؟ حقق دخلاً معنا!\n\n📢 شارك رابطك الشخصي\n💰 10\$ لكل مكالمة + 5\$ لكل تجنيد\n📊 لوحة تحكم لمتابعة أرباحك\n\nهيا بنا! 🔥",
        'zh' => "欢迎加入SOS-Expat影响者！⭐\n\n有粉丝？和我们一起变现！\n\n📢 分享你的个人链接\n💰 每次通话10\$ + 每次招募5\$\n📊 收入仪表板\n\n开始吧！🔥",
        'hi' => "SOS-Expat इन्फ्लुएंसर्स में स्वागत! ⭐\n\nऑडियंस है? हमारे साथ मोनेटाइज करें!\n\n📢 अपना लिंक शेयर करें\n💰 \$10 प्रति कॉल + \$5 प्रति भर्ती\n📊 कमाई डैशबोर्ड\n\nचलो शुरू करें! 🔥",
        'ru' => "Добро пожаловать в SOS-Expat Influencers! ⭐\n\nЕсть аудитория? Монетизируйте её!\n\n📢 Делитесь своей ссылкой\n💰 10\$ за звонок + 5\$ за привлечение\n📊 Панель отслеживания доходов\n\nПоехали! 🔥",
    ],
    'group_admin' => [
        'fr' => "Bienvenue Group Admin ! ⚙️\n\nTu gères des groupes WhatsApp d'expatriés ? Parfait !\n\n💰 Gagne des commissions sur chaque appel passé par tes membres\n📢 Partage le lien SOS-Expat dans tes groupes\n🤝 Recrute d'autres admins pour multiplier tes gains\n\nOn compte sur toi ! 💪",
        'en' => "Welcome Group Admin! ⚙️\n\nYou manage expat WhatsApp groups? Perfect!\n\n💰 Earn commissions on every call from your members\n📢 Share the SOS-Expat link in your groups\n🤝 Recruit other admins to multiply earnings\n\nWe're counting on you! 💪",
        'de' => "Willkommen Group Admin! ⚙️\n\nSie verwalten Expat-Gruppen? Perfekt!\n\n💰 Provision für jeden Anruf Ihrer Mitglieder\n📢 Teilen Sie den SOS-Expat Link\n🤝 Rekrutieren Sie weitere Admins\n\nWir zählen auf Sie! 💪",
        'pt' => "Bem-vindo Group Admin! ⚙️\n\nVocê gerencia grupos de expatriados? Perfeito!\n\n💰 Ganhe comissões por cada chamada dos seus membros\n📢 Compartilhe o link SOS-Expat\n🤝 Recrute outros admins\n\nContamos com você! 💪",
        'es' => "¡Bienvenido Group Admin! ⚙️\n\n¿Gestionas grupos de expatriados? ¡Perfecto!\n\n💰 Gana comisiones por cada llamada de tus miembros\n📢 Comparte el enlace SOS-Expat\n🤝 Recluta otros admins\n\n¡Contamos contigo! 💪",
        'ar' => "مرحباً مدير المجموعة! ⚙️\n\nتدير مجموعات واتساب للمغتربين؟ ممتاز!\n\n💰 اكسب عمولات على كل مكالمة من أعضائك\n📢 شارك رابط SOS-Expat\n🤝 جند مديرين آخرين\n\nنعتمد عليك! 💪",
        'zh' => "欢迎群管理员！⚙️\n\n管理外籍人士群？完美！\n\n💰 从成员通话中赚取佣金\n📢 分享SOS-Expat链接\n🤝 招募更多管理员\n\n我们靠你了！💪",
        'hi' => "ग्रुप एडमिन स्वागत है! ⚙️\n\nप्रवासी WhatsApp ग्रुप चलाते हैं? बढ़िया!\n\n💰 सदस्यों की हर कॉल पर कमीशन\n📢 SOS-Expat लिंक शेयर करें\n🤝 और एडमिन भर्ती करें\n\nहम आप पर भरोसा करते हैं! 💪",
        'ru' => "Добро пожаловать, Group Admin! ⚙️\n\nУправляете группами экспатов? Отлично!\n\n💰 Комиссия за каждый звонок участников\n📢 Делитесь ссылкой SOS-Expat\n🤝 Привлекайте других админов\n\nМы рассчитываем на вас! 💪",
    ],
    'expatrie_aidant' => [
        'fr' => "Bienvenue dans la communauté des Expatriés Aidants ! 🤝\n\nVous aidez d'autres expatriés avec vos connaissances locales ? Bravo !\n\n📞 Recevez des appels et partagez votre expertise\n💰 Gagnez de l'argent à chaque consultation\n\nMerci d'être là ! 🙏",
        'en' => "Welcome to the Expat Helpers community! 🤝\n\nYou help other expats with your local knowledge? Awesome!\n\n📞 Receive calls and share your expertise\n💰 Earn money for every consultation\n\nThank you for being here! 🙏",
        'de' => "Willkommen bei den Expat-Helfern! 🤝\n\nSie helfen anderen Expats? Großartig!\n\n📞 Erhalten Sie Anrufe\n💰 Verdienen Sie pro Beratung\n\nDanke fürs Mitmachen! 🙏",
        'pt' => "Bem-vindo à comunidade de Expatriados Ajudantes! 🤝\n\nVocê ajuda outros expatriados? Incrível!\n\n📞 Receba chamadas\n💰 Ganhe por consulta\n\nObrigado por estar aqui! 🙏",
        'es' => "¡Bienvenido a la comunidad de Expatriados Ayudantes! 🤝\n\n¿Ayudas a otros expatriados? ¡Genial!\n\n📞 Recibe llamadas\n💰 Gana por cada consulta\n\n¡Gracias por estar aquí! 🙏",
        'ar' => "مرحباً في مجتمع المغتربين المساعدين! 🤝\n\nتساعد مغتربين آخرين؟ رائع!\n\n📞 استقبل مكالمات\n💰 اكسب مقابل كل استشارة\n\nشكراً لوجودك! 🙏",
        'zh' => "欢迎加入外籍助手社区！🤝\n\n您帮助其他外籍人士？太棒了！\n\n📞 接听电话\n💰 每次咨询赚钱\n\n感谢您的加入！🙏",
        'hi' => "प्रवासी सहायक समुदाय में स्वागत! 🤝\n\nआप अन्य प्रवासियों की मदद करते हैं? शानदार!\n\n📞 कॉल प्राप्त करें\n💰 हर परामर्श पर कमाएं\n\nधन्यवाद! 🙏",
        'ru' => "Добро пожаловать в сообщество экспат-помощников! 🤝\n\nПомогаете другим экспатам? Здорово!\n\n📞 Принимайте звонки\n💰 Зарабатывайте за консультации\n\nСпасибо, что вы с нами! 🙏",
    ],
];

$updated = 0;
$groups = App\Models\Group::where('is_active', true)->get();

foreach ($groups as $group) {
    $cat = $group->category;
    $lang = $group->language;

    if (!isset($messages[$cat])) continue;

    $msg = $messages[$cat][$lang] ?? $messages[$cat]['en'] ?? $messages[$cat]['fr'] ?? null;

    if ($msg) {
        $group->update([
            'welcome_enabled' => true,
            'welcome_message' => $msg,
        ]);
        $updated++;
    }
}

echo "Done! {$updated}/{$groups->count()} groupes mis à jour.\n";
