const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function setup() {
    const rawUrl = process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/careconnect_db';
    
    // Tạo connection string kết nối vào database mặc định 'postgres'
    const postgresUrl = rawUrl.replace(/\/careconnect_db(\?.*)?$/, '/postgres$1');

    console.log('====================================================');
    console.log('🚀 Đang kiểm tra và khởi tạo Database CareConnect...');
    console.log('====================================================');

    // Bước 1: Kết nối vào database 'postgres' để kiểm tra xem 'careconnect_db' đã có chưa
    let rootClient;
    try {
        rootClient = new Client({ connectionString: postgresUrl });
        await rootClient.connect();
    } catch (err) {
        console.error('❌ Không thể kết nối tới PostgreSQL server tại localhost:5432:');
        console.error(err.message);
        console.error('\n👉 Hướng dẫn khắc phục:');
        console.error('1. Đảm bảo Docker Desktop hoặc PostgreSQL service đang BẬT.');
        console.error('2. Nếu dùng Docker, hãy chạy: docker start careconnect-db');
        process.exit(1);
    }

    try {
        const checkRes = await rootClient.query(`SELECT 1 FROM pg_database WHERE datname = 'careconnect_db'`);
        if (checkRes.rows.length === 0) {
            console.log('⚙️ Database "careconnect_db" chưa có, đang tạo mới...');
            await rootClient.query('CREATE DATABASE careconnect_db');
            console.log('✅ Đã tạo database "careconnect_db" thành công!');
        } else {
            console.log('ℹ️ Database "careconnect_db" đã tồn tại.');
        }
    } catch (err) {
        console.error('Lỗi khi tạo database:', err.message);
    } finally {
        await rootClient.end();
    }

    // Bước 2: Kết nối trực tiếp vào 'careconnect_db' để nạp Schema & Dữ liệu mẫu
    const dbClient = new Client({ connectionString: rawUrl });
    try {
        await dbClient.connect();
        console.log('🔗 Đã kết nối vào database "careconnect_db".');

        const tableRes = await dbClient.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'users'
        `);

        const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
        const run = async (file) => {
            console.log(`  -> Đang thực thi: ${file}...`);
            await dbClient.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
        };

        if (tableRes.rows.length === 0) {
            console.log('📦 Đang chạy các file migrations (tạo bảng và nạp tài khoản demo)...');
            const files = [
                '001_init_schema.sql',
                '002_seed_data.sql',
                '003_family_care.sql',
                '004_seed_family_demo.sql',
                '020_seed_doctors.sql',
                '021_seed_clinics.sql',
                '022_seed_doctor_clinic_assignments.sql',
                '023_seed_consultations.sql',
                '024_consultation_fee_credit.sql',
                '025_doctor_wallet_earning.sql',
                '030_shop_catalog.sql',
            ];
            for (const file of files) await run(file);
            console.log('🎉 Cài đặt cơ sở dữ liệu hoàn tất 100%!');
        } else {
            console.log('ℹ️ Các bảng dữ liệu và tài khoản demo đã sẵn sàng.');
            // Máy đã cài database từ trước: bổ sung danh mục chung với trang Mua thuốc nếu chưa có
            const shopRef = await dbClient.query(
                `SELECT 1 FROM information_schema.columns WHERE table_name = 'pharmacies' AND column_name = 'shop_ref'`
            );
            if (!shopRef.rows.length) {
                await run('030_shop_catalog.sql');
                console.log('🎉 Đã thêm nhà thuốc, thuốc và tồn kho của trang Mua thuốc.');
            }
        }

        console.log('\n✅ Bây giờ bạn có thể chạy: npm run dev');
    } catch (err) {
        console.error('❌ Lỗi khi nạp dữ liệu migrations:', err.message);
        if (err.message.includes('postgis')) {
            console.error('\n⚠️ LƯU Ý VỀ POSTGIS:');
            console.error('Hệ thống CareConnect sử dụng PostGIS để tính toán bán kính giao thuốc 3-5km.');
            console.error('Nếu chưa có PostGIS, khuyến nghị chạy PostgreSQL bằng Docker:');
            console.error('docker run -d --name careconnect-db -e POSTGRES_PASSWORD=123456 -e POSTGRES_DB=careconnect_db -p 5432:5432 postgis/postgis:16-3.4');
        }
    } finally {
        await dbClient.end();
    }
}

setup();
