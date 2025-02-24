// Configuration imported from JS
declare const GF_ID: u32;
declare const GF_M: f32;
declare const GF_S: f32;
declare const T: f32;

let WORLD_SIZE: u32;

const BUFFER_CELLS_IDX = 0;
const BUFFER_CELLS_OLD_IDX = 1;
const BUFFER_CELLS_IMAG_IDX = 2;
const BUFFER_FIELD_IDX = 3;
const BUFFER_POTENTIAL_REAL_IDX = 4;
const BUFFER_POTENTIAL_IMAG_IDX = 5;
const BUFFER_KERNEL_REAL_IDX = 6;
const BUFFER_KERNEL_IMAG_IDX = 7;
const BUFFER_CELLS_OUT_IDX = 8;
const BUFFER_TABLES_IDX = 9;

const BUFFER_COS_TABLE_IDX = 0;
const BUFFER_SIN_TABLE_IDX = 1;
const BUFFER_RBITS_TABLE_IDX = 2;


@inline
function get(idx: u32, x: u32, y: u32): f32 {
  return load<f32>((idx * WORLD_SIZE**2 + y * WORLD_SIZE + x) << 2);
}

@inline
function set(idx: u32, x: u32, y: u32, v: f32): void {
  store<f32>((idx * WORLD_SIZE**2 + y * WORLD_SIZE + x) << 2, v);
}

@inline
function getx4(idx: u32, x: u32, y: u32): v128 {
  return v128.load((idx * WORLD_SIZE**2 + y * WORLD_SIZE + x) << 2)
}

@inline
function setx4(idx: u32, x: u32, y: u32, vec: v128): void {
  v128.store((idx * WORLD_SIZE**2 + y * WORLD_SIZE + x) << 2, vec)
}

@inline
function getx4v(idx: u32, x: u32, y: u32): v128 {
  let vec = v128.splat<f32>(0.);
  vec = f32x4.replace_lane(vec, 0, get(idx, x, y))
  vec = f32x4.replace_lane(vec, 1, get(idx, x, y + 1))
  vec = f32x4.replace_lane(vec, 2, get(idx, x, y + 2))
  vec = f32x4.replace_lane(vec, 3, get(idx, x, y + 3))

  return vec
}

@inline
function setx4v(idx: u32, x: u32, y: u32, vec: v128): void {
  set(idx, x, y, f32x4.extract_lane(vec, 0))
  set(idx, x, y + 1, f32x4.extract_lane(vec, 1))
  set(idx, x, y + 2, f32x4.extract_lane(vec, 2))
  set(idx, x, y + 3, f32x4.extract_lane(vec, 3))
}

/** Performs one step. Called about 30 times a second from JS. */
export function updateFn(): void {
  memory.copy((BUFFER_CELLS_OLD_IDX * WORLD_SIZE**2) << 2, (BUFFER_CELLS_IDX * WORLD_SIZE**2) << 2, WORLD_SIZE**2 << 2)
  memory.fill((BUFFER_CELLS_IMAG_IDX * WORLD_SIZE**2) << 2, 0, WORLD_SIZE**2 << 2)

  // Change cells inplace
  applyKernel()

  const GF_MSplat = v128.splat<f32>(GF_M)
  const GF_SSplat = v128.splat<f32>(GF_S)
  const TSplat = v128.splat<f32>(T)
  for (let y: u32 = 0; y < WORLD_SIZE; y++) {
      for (let x: u32 = 0; x < WORLD_SIZE; x += 4) {
          let p = getx4(BUFFER_POTENTIAL_REAL_IDX, x, y);
          let g = growthFn(GF_ID, GF_MSplat, GF_SSplat, p);
          let v = f32x4.add(getx4(BUFFER_CELLS_OLD_IDX, x, y),  f32x4.div(g, TSplat));

          // Clip
          v = f32x4.min(f32x4.max(v, v128.splat<f32>(0.)), v128.splat<f32>(1.))

          setx4(BUFFER_CELLS_OUT_IDX, x, y, v)
      }
  }
}

function applyKernel(): void {
  // f * g = F-1( F(f) dot F(g) )
  FFT2D(1, BUFFER_CELLS_IDX, BUFFER_CELLS_IMAG_IDX);
  complexMatrixDot(
    BUFFER_CELLS_IDX,
    BUFFER_CELLS_IMAG_IDX,
    BUFFER_KERNEL_REAL_IDX,
    BUFFER_KERNEL_IMAG_IDX,
    BUFFER_POTENTIAL_REAL_IDX,
    BUFFER_POTENTIAL_IMAG_IDX
  );
  FFT2D(-1, BUFFER_POTENTIAL_REAL_IDX, BUFFER_POTENTIAL_IMAG_IDX);
}  

export function FFT2D(dir: i8, idxReal: u32, idxImag: u32): void {
  for (let y: u32 = 0; y < WORLD_SIZE; y += 4) {
    FFT1D(dir, y, idxReal, idxImag);
  }

  transpose2D(idxReal);
  transpose2D(idxImag);

  for (let y: u32 = 0; y < WORLD_SIZE; y += 4) {
    FFT1D(dir, y, idxReal, idxImag);
  }
}

function transpose2D(idx: u32): void {
  for (let y: u32 = 0; y < WORLD_SIZE; y++) {
      for (let x: u32 = 0; x < y; x++) {
          const tmp_re = get(idx, x, y);
          set(idx, x, y, get(idx, y, x))
          set(idx, y, x, tmp_re)
      }
  }
}

function FFT1D(dir: i8, y: u32, idxReal: u32, idxImag: u32): void {
  /* Compute the FFT */
  if (dir == -1){
    FFT1DRadix2(y, idxReal, idxImag)

    let scale_f = v128.splat<f32>(1.0 / (WORLD_SIZE as f32));
    for (let x: u32 = 0; x < WORLD_SIZE; x++) {
      setx4v(idxReal, x, y, f32x4.mul(getx4v(idxReal, x, y), scale_f));
      setx4v(idxImag, x, y, f32x4.mul(getx4v(idxImag, x, y), scale_f));
    }
  } else {
    FFT1DRadix2(y, idxImag, idxReal)
  }

}

function FFT1DRadix2(y: u32, idxReal: u32, idxImag: u32): void {
  // Create SIMD get/set functions on y and used them here
  for (let x: u32 = 0; x < WORLD_SIZE; x++) {
    let x1 = get(BUFFER_TABLES_IDX, x, BUFFER_RBITS_TABLE_IDX) as u32;
    if (x1 > x) {
      let tmp = getx4v(idxReal, x, y);
      setx4v(idxReal, x, y, getx4v(idxReal, x1, y));
      setx4v(idxReal, x1, y, tmp);

      tmp = getx4v(idxImag, x, y);
      setx4v(idxImag, x, y, getx4v(idxImag, x1, y));
      setx4v(idxImag, x1, y, tmp);
    }
  }
  

	// Cooley-Tukey decimation-in-time radix-2 FFT
	for (let size: u32 = 2; size <= WORLD_SIZE; size *= 2) {
		let halfsize = size / 2;
		let tablestep = WORLD_SIZE / size;
		for (let i: u32 = 0; i < WORLD_SIZE; i += size) {
			for (let x: u32 = i, k = 0; x < i + halfsize; x++, k += tablestep) {
				let x2 = x + halfsize;

        let cos = v128.splat<f32>(get(BUFFER_TABLES_IDX, k, 0));
        let sin = v128.splat<f32>(get(BUFFER_TABLES_IDX, k, 1));

				let tpre = f32x4.add(f32x4.mul(getx4v(idxReal, x2, y), cos), f32x4.mul(getx4v(idxImag, x2, y), sin));
				let tpim = f32x4.sub(f32x4.mul(getx4v(idxImag, x2, y), cos), f32x4.mul(getx4v(idxReal, x2, y), sin));

				setx4v(idxReal, x2, y, f32x4.sub(getx4v(idxReal, x, y), tpre));
				setx4v(idxImag, x2, y, f32x4.sub(getx4v(idxImag, x, y), tpim));
				setx4v(idxReal, x, y, f32x4.add(getx4v(idxReal, x, y), tpre));
        setx4v(idxImag, x, y, f32x4.add(getx4v(idxImag, x, y), tpim));
			}
		}
	}
}

function reverseBits(val: u32, width: u32): u32 {
  var result = 0;
  for (var i: u32 = 0; i < width; i++) {
    result = (result << 1) | (val & 1);
    val >>>= 1;
  }
  return result;
}

function complexMatrixDot(
  leftsideIdxReal: u32,
  leftsideIdxImag: u32,
  rightsideIdxReal: u32,
  rightsideIdxImag: u32,
  outputIdxReal: u32,
  outputIdxImag: u32
): void {

  for (let y: u32 = 0; y < WORLD_SIZE; y++) {
      for (let x: u32 = 0; x < WORLD_SIZE; x += 4) {
        let ls_r = getx4(leftsideIdxReal, x, y);
        let ls_i = getx4(leftsideIdxImag, x, y);
        let rs_r = getx4(rightsideIdxReal, x, y);
        let rs_i = getx4(rightsideIdxImag, x, y);

        let t0 = f32x4.mul(ls_r, f32x4.add(rs_r, rs_i));
        let t1 = f32x4.mul(rs_i, f32x4.add(ls_r, ls_i))
        let t2 = f32x4.mul(rs_r, f32x4.sub(ls_i, ls_r))

        let o_r = f32x4.sub(t0, t1);
        let o_i = f32x4.add(t0, t2);

        setx4(outputIdxReal, x, y, o_r);
        setx4(outputIdxImag, x, y, o_i);
      }
  }
}

function growthFn(gf_id: u32, gf_m: v128, gf_s: v128, x: v128): v128 {
  x = f32x4.abs(f32x4.sub(x, gf_m));
  x = f32x4.mul(x, x);

  switch (gf_id) {
      case 0:
        let gf_s_2 = f32x4.mul(gf_s, gf_s)
        let d = f32x4.mul(v128.splat<f32>(9.), gf_s_2);
        let out = f32x4.div(x, d)
        out = f32x4.sub(v128.splat<f32>(1.), out)
        out = f32x4.max(out, v128.splat<f32>(0.))
        out = f32x4.mul(f32x4.mul(f32x4.mul(out, out), out), out)
        return f32x4.sub(f32x4.mul(out, v128.splat<f32>(2.)), v128.splat<f32>(1.));
  }
  return v128.splat<f32>(0.)
}

export function setWorldSize(worldSize: u32): void {
  WORLD_SIZE = worldSize

    // Trigonometric tables
  for (let i: u32 = 0; i < WORLD_SIZE / 2; i++) {
    let i_pi_2 = 2. * Math.PI * i;
    let cos: f32 = Math.cos(i_pi_2 / WORLD_SIZE) as f32;
    let sin: f32 = Math.sin(i_pi_2 / WORLD_SIZE) as f32;
    set(BUFFER_TABLES_IDX, i, BUFFER_COS_TABLE_IDX, cos);
    set(BUFFER_TABLES_IDX, i, BUFFER_SIN_TABLE_IDX, sin);
  }

  let WORLD_SIZE_LOG_2: u32 = 0;
  for (let i: u32 = 0; i < 32; i++) {
    if (1 << i == WORLD_SIZE){
      WORLD_SIZE_LOG_2 = i;  
    }
  }

  // reverse bits table
  for (let i: u32 = 0; i < WORLD_SIZE; i++) {
    let rbitIdx = reverseBits(i, WORLD_SIZE_LOG_2) as f32;
    set(BUFFER_TABLES_IDX, i, BUFFER_RBITS_TABLE_IDX, rbitIdx);
  }
}