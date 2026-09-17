# dsh-fal-imagegen

**اللغات:** [English](README.md) · [中文](README.zh.md) · [Español](README.es.md) · **العربية** · [Français](README.fr.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

توليد صور أصلي عبر [fal.ai](https://fal.ai) لـ DeepSeek Harness (DSH): بطاقة إعدادات ثنائية اللغة لمفتاح FAL_KEY والإعدادات الافتراضية، بالإضافة إلى أدوات وكيل تتحدث بروتوكول fal من البداية إلى النهاية — دون أي بوابة متوافقة مع OpenAI في المنتصف.

## الميزات

- **بروتوكول fal الأصلي** — `POST https://queue.fal.run/<slug>` مع `Authorization: Key <key_id>:<key_secret>`، استطلاع تذكرة الطابور (`status_url` → `response_url`)، واستهلاك `{ images: [{ url, width, height }] }`.
- **توليد غير متزامن افتراضيًا** — `fal_generate_image` يرسل المهمة إلى طابور fal ويعيد فورًا `task_id`؛ مجمّع في الخلفية ينهيها، و`fal_get_image_task` يستعلم عن التقدم ويُسلّم الصور النهائية (مع إمكانية الانتظار حتى 120 ثانية لكل استعلام). مرّر `wait=true` إذا كنت تفضّل السلوك المُعطِّل القديم.
- **بطاقة إعدادات ثنائية اللغة** — "fal 生图" / "fal imagegen" ضمن الإعدادات ← الإضافات: المفتاح الرئيسي، FAL_KEY، نقطتا نهاية افتراضيتان للتحويل من نص إلى صورة ومن صورة إلى صورة، الحجم، الجودة، صيغة الإخراج، المهلة، مجلد الإخراج، ومفتاح الإعلان في موجه النظام. البطاقة مطابقة لواجهة بطاقات الإضافات المدمجة (قابلة للطي، وسم عدم الحفظ، إعادة تعيين لكل حقل، حفظ/تجاهل) وتكتشف لغة الواجهة تلقائيًا — مع مبدّل 中文 / English داخل البطاقة يُحفظ بين عمليات التحميل.
- **أدوات الوكيل**:

  | الأداة | الغرض |
  | --- | --- |
  | `fal_generate_image` | نص ← صورة، غير متزامنة افتراضيًا: `prompt` / `model` / `size` / `quality` / `count` / `wait` → تعيد `task_id` |
  | `fal_get_image_task` | استعلام مهام الخلفية: التقدم، الانتظار، والصور النهائية (بواسطة `task_id` أو `request_id` الخاصة بـ fal؛ اتركهما فارغين لعرض المهام الأخيرة) |
  | `fal_edit_image` | صورة ← صورة، متزامنة: `prompt` + مصدر (مرجع مرفق أو `image_path` على القرص) |
  | `fal_list_image_models` | قائمة الأسماء المستعارة المدمجة والقيم الافتراضية الحالية ومجلد الإخراج |

- **نتائج قابلة لإعادة الاستخدام** — كل صورة تُرفَق بالمحادثة (تظهر بجانب استدعاء الأداة) **وتُكتب** على القرص تحت `<DSH_HOME>/fal-imagegen`؛ ويمكن تمرير `path` المُعاد مباشرة إلى `image_path` في `fal_edit_image`.
- **أسماء مستعارة مُتحقق منها** — كل اسم مستعار مدمج فُحص ضد مخطط نقاط نهاية fal؛ الأسماء غير المعروفة التي تحتوي "/" تُمرَّر كما هي، ويُرفض اسم نقطة نهاية نص-إلى-صورة بوضوح عند استخدامه للتحرير بدلًا من إرسال طلب مكسور.

## التوليد غير المتزامن

`fal_generate_image` لم يعد يُعطّل دور الوكيل على طابور fal:

1. الأداة تُرسل المهمة وتجيب بـ `{ status: "queued", task_id, request_id, message, next_action, images: [] }` فور قبول fal لها.
2. مجمّع منفصل في الخلفية يستطلع الطابور، ويُنزّل الصور، ويحفظها كمرفقات، وينسخها إلى مجلد الإخراج — كل ذلك في الخلفية.
3. `fal_get_image_task` (`task_id` مطلوب، أو `request_id` الخاصة بـ fal) يعيد `queued / running / completed / failed`. مع `wait_seconds` (0–120) ينتظر حتى ذلك الحد؛ وعند `completed` يحمل الناتج `images[]` كاملًا مع `attachment_id` و`path` المحلي وتظهر الصور بجانب الاستدعاء.
4. بدون معرف، تعرض الأداة المهام الأخيرة (`task_id`، الحالة، النموذج، عدد الصور).

ملاحظات: سجلات المهام تعيش في عملية المضيف الحالية (تُحفظ نحو 6 ساعات، آخر 64 مهمة)؛ المهمة التي انتهت مهلة انتظارها في الخلفية يُعاد محاولتها تلقائيًا عند الاستعلام التالي؛ `fal_edit_image` تبقى متزامنة لأن نتيجتها تكون عادةً مدخل الخطوة التالية.

## الأسماء المستعارة للنماذج

| الاسم المستعار | نقطة نهاية نص←صورة | نقطة نهاية صورة←صورة | معامل الحجم | مستوى الجودة |
| --- | --- | --- | --- | --- |
| `gpt-image-2.5-flare` (الافتراضي؛ يقبل أيضًا `gpt-image-2.5` / `gpt-image-2.5-flash`) | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` | `image_size` | مدعوم |
| `gpt-image-2.5-sunburst` | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` | `image_size` | مدعوم |
| `gpt-image-2` | `openai/gpt-image-2` | `openai/gpt-image-2/edit` | `image_size` | مدعوم |
| `gpt-image-1.5` | `fal-ai/gpt-image-1.5` | `fal-ai/gpt-image-1.5/edit` | `image_size` | مدعوم |
| `nano-banana-2` | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | `aspect_ratio` | محذوف |
| `gemini-25-flash-image` | `fal-ai/gemini-25-flash-image` | `fal-ai/gemini-25-flash-image/edit` | `aspect_ratio` | محذوف |
| `flux-2-flash` | `fal-ai/flux-2/flash` | `fal-ai/flux-2/flash/edit` | `image_size` | محذوف |

## الإعدادات

| الحقل | الافتراضي | المعنى |
| --- | --- | --- |
| `enabled` | `true` | المفتاح الرئيسي (الأدوات + الإعلان في الموجه) |
| `falKey` | فارغ | FAL_KEY بصيغة `key_id:key_secret` (انسخ السلسلة الكاملة من fal.ai ← Keys) |
| `defaultTextToImageModel` | `openai/gpt-image-2.5/flare/text-to-image` | نقطة نهاية نص←صورة |
| `defaultImageToImageModel` | `openai/gpt-image-2.5/flare/edit` | نقطة نهاية صورة←صورة |
| `defaultImageSize` | `1:1` | `1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9`، زوج بكسل `WxH`، أو `auto` |
| `quality` | `high` | `auto / low / medium / high / xhigh / max` (تُحذف تلقائيًا للنقاط التي لا توثق مستوى) |
| `outputFormat` | `png` | `png / jpeg / webp` |
| `timeoutSeconds` | `300` | الميزانية الكلية للطلب الواحد (إرسال + طابور + جلب) |
| `saveDir` | فارغ | مجلد الإخراج؛ فارغ = `<DSH_HOME>/fal-imagegen` |
| `announceToAgent` | `true` | الإعلان عن الإضافة في كل موجه نظام للوكيل |

البطاقة تعدّل نفس الإعدادات التي يعدلها قسم `dsh-fal-imagegen:` في `~/.dsh/settings.yaml`. FAL_KEY حقل كلمة مرور: تركه فارغًا يُبقي المفتاح الحالي (يُستبدَل المفتاح بعلامات في كل عروض الشبكة).

## التثبيت

### npm (موصى به)

`dsh-fal-imagegen@0.2.0` منشور:

```sh
# الملفات الشخصية المُدارة عبر CLI (web / headless / مخصص):
dsh plugin --profile web add dsh-fal-imagegen
# أعد تشغيل العملية المقابلة بعد ذلك
```

**ملف سطح المكتب** يملكه تطبيق DSH Desktop (`dsh plugin --profile desktop` مرفوض): ثبّت عبر الإعدادات ← الإضافات ← السوق، أو سجّله يدويًا في `~/.dsh/profiles/desktop/package.json` (التبعية + `dsh-fal-imagegen` في `dsh.profile.bundles`)، ثم أعد تشغيل DSH Desktop بالكامل.

بعد التثبيت عبّئ FAL_KEY في الإعدادات ← الإضافات ← 插件配置 ← بطاقة "fal 生图"، أو اكتب قسم `dsh-fal-imagegen:` في `~/.dsh/settings.yaml`.

### من git (مسار بديل)

```sh
dsh plugin --profile web add github:Enchanted0911/dsh-fal-imagegen
```

### من المصدر

```sh
git clone https://github.com/Enchanted0911/dsh-fal-imagegen
# اربطه بملف شخصي — تبعية + إدخال dsh.profile.bundles — ثم أعد تشغيل DSH Desktop
```

حزم التشغيل (`@deepseek-ai/dsh-tools`، `dsh-attachment`، `dsh-settings`، `schemastery`) تأتي من المضيف؛ ومجلد `node_modules/` في شجرة المصدر موجود فقط لتحميل الاختبارات دون اتصال خارج المضيف.

## التطوير

اختبارات دون اتصال (بلا مفتاح، بلا شبكة):

```sh
node tests/fal-manifest-test.mjs             # عقد البيان: سطر التصحيح، exports، dsh.client، معرف الغلاف
node tests/fal-client-test.mjs               # نصف المتصفح: تسجيل الفتحات، حالات البطاقة، عمليات الحفظ، المبدّل ثنائي اللغة
node tests/fal-settings-roundtrip-test.mjs   # النصفان معًا: كتابة البطاقة ← قراءة المضيف، إعادة التعيين، المفاتيح
node tests/fal-schema-test.mjs               # مخططات معاملات الأدوات ومخرجاتها
node tests/fal-tasks-test.mjs                # المسار غير المتزامن: إرسال ← إنهاء في الخلفية ← استعلام، بطابور fal وهمي
```

اختبارات حية (تستهلك رصيد fal):

```sh
FAL_KEY='<key_id>:<key_secret>' node tests/fal-host-test.mjs   # محاكاة المضيف: توليد + تحرير + مرفقات + مسارات الفشل
FAL_KEY='<key_id>:<key_secret>' node tests/fal-smoke.mjs       # عميل fal فقط (توليد واحد)
```

أثر تغيير المصدر في تثبيت مربوط: تغييرات نصف المتصفح (`lib/client.js`) تُطبق بتحديث الصفحة؛ تغييرات نصف المضيف وتغييرات بيان `package.json` تتطلب إعادة تشغيل DSH Desktop.

## مصدر كتالوج السوق

سوق مجتمع DSH بلا مصدر افتراضي؛ هذا المستودع يحمل مصدر كتالوج مطابقًا لعقد v1 تحت `catalog/` (انظر `catalog/entry.mjs`). انشر صيغة Cloudflare Pages وسجّل عنوان البيان في الإعدادات ← الإضافات ← السوق ← المصادر:

```sh
npx wrangler pages deploy catalog/pages --project-name dsh-fal-imagegen-catalog
# ثم أضف https://dsh-fal-imagegen-catalog.pages.dev/catalog-source.json كمصدر
```

## القيود

- نقاط النهاية التي توثق `aspect_ratio` (nano-banana / gemini) تخفض أحجام البكسل الصريحة إلى `auto`.
- التوليد يستهلك رصيد fal، ومحتوى الصور يُنتجه النموذج المستضاف لدى fal.